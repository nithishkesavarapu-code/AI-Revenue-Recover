import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CasesService } from "./cases.service";
import { CaseActionsService } from "./cases-actions.service";

@Controller("cases")
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly caseActions: CaseActionsService,
  ) {}

  /** KPI summary — declared before the :id route so "stats" is not captured as an id. */
  @Get("stats/summary")
  statsSummary() {
    return this.casesService.statsSummary();
  }

  /** Recovery-strategy comparison — also before the :id route. */
  @Get("stats/strategies")
  strategies() {
    return this.casesService.strategies();
  }


  /** Execute a case's recommended action through the policy gate. Declared before :id. */
  @Post(":id/execute")
  execute(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const caseId = Number(id);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      throw new BadRequestException(`Invalid case id: ${id}`);
    }
    return this.caseActions.execute(caseId, body);
  }

  @Get()
  list(
    @Query("take") take?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
  ) {
    return this.casesService.list({
      take: take ? Number(take) : undefined,
      status,
      type,
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.casesService.get(Number(id));
  }
}

