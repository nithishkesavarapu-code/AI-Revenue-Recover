import { Injectable, NotFoundException } from "@nestjs/common";
import type { ContactPreferenceInput } from "@revrec/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take = 50) {
    return this.prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        _count: {
          select: {
            payments: true,
            subscriptions: true,
            invoices: true,
            recoveryCases: true,
          },
        },
      },
    });
  }

  async get(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 20 },
        subscriptions: true,
        invoices: { orderBy: { dueDate: "desc" } },
        recoveryCases: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  async setPreference(customerId: number, input: ContactPreferenceInput) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const preference = await this.prisma.contactPreference.upsert({
      where: { customerId_channel: { customerId, channel: input.channel } },
      create: { customerId, channel: input.channel, status: input.status, source: input.source },
      update: { status: input.status, source: input.source },
    });
    await this.prisma.auditLog.create({
      data: {
        actor: "operator",
        action: "CONTACT_PREFERENCE_UPDATED",
        entityType: "customer",
        entityId: String(customerId),
        payload: { channel: input.channel, status: input.status, source: input.source } as Prisma.InputJsonValue,
      },
    });
    return preference;
  }
}
