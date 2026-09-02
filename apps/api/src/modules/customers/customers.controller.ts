import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { contactPreferenceSchema } from "@revrec/shared";
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
    const customer = await this.customersService.get(this.customerId(id));
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  @Post(":id/preferences")
  setPreference(@Param("id") id: string, @Body() body: unknown) {
    const parsed = contactPreferenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Invalid contact preference", issues: parsed.error.flatten() });
    }
    return this.customersService.setPreference(this.customerId(id), parsed.data);
  }

  private customerId(value: string) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`Invalid customer id: ${value}`);
    return id;
  }
}
