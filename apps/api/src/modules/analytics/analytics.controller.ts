import { Controller, Get } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
@Controller("analytics")
export class AnalyticsController { constructor(private readonly analytics: AnalyticsService) {} @Get("recovery") recovery() { return this.analytics.recovery(); } }
