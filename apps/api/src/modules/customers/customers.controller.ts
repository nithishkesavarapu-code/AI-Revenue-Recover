import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@Query("take") take?: string) {
    const limit = Math.min(Math.max(Number(take ?? 50) || 50, 1), 200);
    return this.customersService.list(limit);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const customer = await this.customersService.get(Number(id));
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }
}
