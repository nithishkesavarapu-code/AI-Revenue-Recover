import { Injectable } from "@nestjs/common";
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
}
