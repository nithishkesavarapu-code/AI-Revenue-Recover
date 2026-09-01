import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === "/health" || request.path.startsWith("/webhooks/")) return true;

    const required = this.config.get<string>("API_AUTH_TOKEN");
    if (!required) {
      if (this.config.get("NODE_ENV") === "production") {
        throw new UnauthorizedException("API_AUTH_TOKEN must be configured in production");
      }
      return true;
    }
    const provided = request.header("x-api-key") ?? "";
    const expectedBytes = Buffer.from(required);
    const receivedBytes = Buffer.from(provided);
    if (expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
      throw new UnauthorizedException("Invalid API key");
    }
    return true;
  }
}
