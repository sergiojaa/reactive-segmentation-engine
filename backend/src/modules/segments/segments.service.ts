import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { SegmentResponseDto } from './dto/segment-response.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import {
  extractDependencySegmentIds,
  toInputJsonValue,
} from './segment-rules.util';
import { toSegmentResponse } from './segments.mapper';

const segmentWithDependenciesInclude = {
  dependencies: {
    select: { dependsOnSegmentId: true },
  },
} as const;

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createSegmentDto: CreateSegmentDto,
  ): Promise<SegmentResponseDto> {
    const dependencySegmentIds = extractDependencySegmentIds(
      createSegmentDto.rules ?? null,
    );
    await this.ensureDependenciesExist(dependencySegmentIds);

    const createdSegment = await this.prisma.$transaction(async (tx) => {
      const key = await this.generateUniqueKey(createSegmentDto.name, tx);

      const segment = await tx.segment.create({
        data: {
          key,
          name: createSegmentDto.name,
          description: createSegmentDto.description,
          type: createSegmentDto.type,
          status: createSegmentDto.status,
          definitionJson:
            createSegmentDto.rules === undefined
              ? Prisma.JsonNull
              : toInputJsonValue(createSegmentDto.rules),
        },
        include: segmentWithDependenciesInclude,
      });

      if (dependencySegmentIds.length > 0) {
        await tx.segmentDependency.createMany({
          data: dependencySegmentIds.map((dependsOnSegmentId) => ({
            segmentId: segment.id,
            dependsOnSegmentId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.segment.findUniqueOrThrow({
        where: { id: segment.id },
        include: segmentWithDependenciesInclude,
      });
    });

    return toSegmentResponse(createdSegment);
  }

  async findAll(): Promise<SegmentResponseDto[]> {
    const segments = await this.prisma.segment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: segmentWithDependenciesInclude,
    });

    return segments.map((segment) => toSegmentResponse(segment));
  }

  async findOne(id: string): Promise<SegmentResponseDto> {
    const segment = await this.prisma.segment.findFirst({
      where: { id, deletedAt: null },
      include: segmentWithDependenciesInclude,
    });

    if (!segment) {
      throw new NotFoundException(`Segment with id "${id}" was not found`);
    }

    return toSegmentResponse(segment);
  }

  async update(
    id: string,
    updateSegmentDto: UpdateSegmentDto,
  ): Promise<SegmentResponseDto> {
    await this.ensureSegmentExists(id);

    const dependencySegmentIds =
      updateSegmentDto.rules !== undefined
        ? extractDependencySegmentIds(updateSegmentDto.rules)
        : null;

    if (dependencySegmentIds) {
      if (dependencySegmentIds.includes(id)) {
        throw new BadRequestException('Segment cannot depend on itself');
      }
      await this.ensureDependenciesExist(dependencySegmentIds);
    }

    const updatedSegment = await this.prisma.$transaction(async (tx) => {
      const segment = await tx.segment.update({
        where: { id },
        data: {
          name: updateSegmentDto.name,
          description: updateSegmentDto.description,
          type: updateSegmentDto.type,
          status: updateSegmentDto.status,
          definitionJson:
            updateSegmentDto.rules === undefined
              ? undefined
              : updateSegmentDto.rules === null
                ? Prisma.JsonNull
                : toInputJsonValue(updateSegmentDto.rules),
          version: { increment: 1 },
        },
      });

      if (dependencySegmentIds) {
        await tx.segmentDependency.deleteMany({
          where: { segmentId: id },
        });

        if (dependencySegmentIds.length > 0) {
          await tx.segmentDependency.createMany({
            data: dependencySegmentIds.map((dependsOnSegmentId) => ({
              segmentId: id,
              dependsOnSegmentId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.segment.findUniqueOrThrow({
        where: { id: segment.id },
        include: segmentWithDependenciesInclude,
      });
    });

    return toSegmentResponse(updatedSegment);
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    await this.ensureSegmentExists(id);

    const deletedSegment = await this.prisma.segment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!deletedSegment.deletedAt) {
      throw new BadRequestException('Segment deletion timestamp was not set');
    }

    return deletedSegment as { id: string; deletedAt: Date };
  }

  private async ensureSegmentExists(id: string): Promise<void> {
    const segment = await this.prisma.segment.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!segment) {
      throw new NotFoundException(`Segment with id "${id}" was not found`);
    }
  }

  private async ensureDependenciesExist(segmentIds: string[]): Promise<void> {
    if (segmentIds.length === 0) {
      return;
    }

    const existingSegments = await this.prisma.segment.findMany({
      where: {
        id: { in: segmentIds },
        deletedAt: null,
      },
      select: { id: true },
    });

    const existingIdSet = new Set(
      existingSegments.map((segment) => segment.id),
    );
    const missingDependencies = segmentIds.filter(
      (id) => !existingIdSet.has(id),
    );

    if (missingDependencies.length > 0) {
      throw new BadRequestException(
        `Referenced segment dependencies do not exist: ${missingDependencies.join(', ')}`,
      );
    }
  }

  private async generateUniqueKey(
    name: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const baseKey = this.slugify(name);

    let candidateKey = baseKey;
    let suffix = 1;

    while (true) {
      const existing = await tx.segment.findUnique({
        where: { key: candidateKey },
        select: { id: true },
      });

      if (!existing) {
        return candidateKey;
      }

      suffix += 1;
      candidateKey = `${baseKey}-${suffix}`;
    }
  }

  private slugify(value: string): string {
    const normalized = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (normalized.length === 0) {
      return 'segment';
    }

    return normalized;
  }
}
