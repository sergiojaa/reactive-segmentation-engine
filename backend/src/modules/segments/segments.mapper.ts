import { Segment } from '@prisma/client';
import { SegmentResponseDto } from './dto/segment-response.dto';

export type SegmentWithDependencies = Segment & {
  dependencies: { dependsOnSegmentId: string }[];
};

export function toSegmentResponse(
  segment: SegmentWithDependencies,
): SegmentResponseDto {
  return {
    id: segment.id,
    key: segment.key,
    name: segment.name,
    description: segment.description,
    type: segment.type,
    status: segment.status,
    version: segment.version,
    rules: (segment.definitionJson as Record<string, unknown> | null) ?? null,
    dependencySegmentIds: segment.dependencies.map(
      (dependency) => dependency.dependsOnSegmentId,
    ),
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}
