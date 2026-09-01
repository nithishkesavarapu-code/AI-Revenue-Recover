import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import {
  batchSimulationSchema,
  checkoutAbandonmentEventSchema,
  invoiceOverdueEventSchema,
  paymentFailureEventSchema,
  subscriptionFailureEventSchema,
} from "@revrec/shared";
import { SimulatorService } from "./simulator.service";

/** Parses and validates a request body against a shared Zod schema. */
function parseBody<T>(schema: { safeParse(data: unknown): { success: boolean; data?: T; error?: { flatten(): unknown } } }, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success || result.data === undefined) {
    throw new BadRequestException({
      message: "Invalid request body",
      issues: result.error?.flatten(),
    });
  }
  return result.data;
}

@Controller("simulator")
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get("config")
  config() {
    return {
      description:
        "Simulates revenue-at-risk events. Each event creates the underlying business record plus an OPEN recovery case with a DETECTED timeline event.",
      endpoints: [
        "POST /simulator/events/payment-failure",
        "POST /simulator/events/checkout-abandonment",
        "POST /simulator/events/subscription-failure",
        "POST /simulator/events/invoice-overdue",
        "POST /simulator/batch",
      ],
      defaultBatch: { failedPayments: 25, checkoutAbandonments: 12, subscriptionFailures: 8, invoiceOverdues: 5 },
      maxPerTypeInBatch: 300,
    };
  }

  @Post("events/payment-failure")
  paymentFailure(@Body() body: unknown) {
    return this.simulatorService.simulatePaymentFailure(
      parseBody(paymentFailureEventSchema, body),
    );
  }

  @Post("events/checkout-abandonment")
  checkoutAbandonment(@Body() body: unknown) {
    return this.simulatorService.simulateCheckoutAbandonment(
      parseBody(checkoutAbandonmentEventSchema, body),
    );
  }

  @Post("events/subscription-failure")
  subscriptionFailure(@Body() body: unknown) {
    return this.simulatorService.simulateSubscriptionFailure(
      parseBody(subscriptionFailureEventSchema, body),
    );
  }

  @Post("events/invoice-overdue")
  invoiceOverdue(@Body() body: unknown) {
    return this.simulatorService.simulateInvoiceOverdue(
      parseBody(invoiceOverdueEventSchema, body),
    );
  }

  @Post("batch")
  batch(@Body() body: unknown) {
    return this.simulatorService.runBatch(parseBody(batchSimulationSchema, body));
  }
}
