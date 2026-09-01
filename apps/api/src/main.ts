import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const allowedOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      origin: allowedOrigins?.length ? allowedOrigins : process.env.NODE_ENV !== "production",
      credentials: true,
    },
  });
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3002);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

void bootstrap();
