import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
  ) {}

  async create(dto: CreateCustomerDto): Promise<CustomerResponseDto> {
    const createdCustomer = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          externalId: dto.externalId,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: dto.status,
          country: dto.country,
          city: dto.city,
          dateOfBirth: dto.dateOfBirth,
          attributesJson: dto.attributes
            ? this.toJsonInputValue(dto.attributes)
            : undefined,
        },
      });

      await this.eventsService.recordCustomerCreated(tx, {
        customerId: customer.id,
        externalId: customer.externalId,
        email: customer.email,
      });

      return customer;
    });

    return this.toCustomerResponse(createdCustomer);
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    await this.ensureCustomerExists(id);

    const updateData = this.toCustomerUpdateData(dto);
    const changedFields = Object.keys(updateData);

    if (changedFields.length === 0) {
      throw new BadRequestException(
        'At least one updatable field must be provided',
      );
    }

    const updatedCustomer = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: updateData,
      });

      await this.eventsService.recordCustomerUpdated(tx, {
        customerId: id,
        changedFields,
      });

      return customer;
    });

    return this.toCustomerResponse(updatedCustomer);
  }

  private async ensureCustomerExists(id: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with id "${id}" was not found`);
    }
  }

  private toCustomerUpdateData(
    dto: UpdateCustomerDto,
  ): Prisma.CustomerUpdateInput {
    const updateData: Prisma.CustomerUpdateInput = {};

    if (dto.externalId !== undefined) {
      updateData.externalId = dto.externalId;
    }
    if (dto.email !== undefined) {
      updateData.email = dto.email;
    }
    if (dto.firstName !== undefined) {
      updateData.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      updateData.lastName = dto.lastName;
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }
    if (dto.country !== undefined) {
      updateData.country = dto.country;
    }
    if (dto.city !== undefined) {
      updateData.city = dto.city;
    }
    if (dto.dateOfBirth !== undefined) {
      updateData.dateOfBirth = dto.dateOfBirth;
    }
    if (dto.attributes !== undefined) {
      updateData.attributesJson =
        dto.attributes === null
          ? Prisma.JsonNull
          : this.toJsonInputValue(dto.attributes);
    }

    return updateData;
  }

  private toCustomerResponse(customer: Customer): CustomerResponseDto {
    return {
      id: customer.id,
      externalId: customer.externalId,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      status: customer.status,
      country: customer.country,
      city: customer.city,
      dateOfBirth: customer.dateOfBirth,
      attributes:
        (customer.attributesJson as Record<string, unknown> | null) ?? null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private toJsonInputValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
