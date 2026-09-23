import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  app.useBodyParser("json", { limit: "3mb" });
  app.setGlobalPrefix("api/v1");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = request.get("x-correlation-id") ?? randomUUID();
    response.setHeader("x-correlation-id", correlationId);
    next();
  });
  app.enableCors({
    origin: config.get<string>("WEB_URL"),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Cafe POS API")
      .setVersion("1.0")
      .addCookieAuth(config.get("SESSION_COOKIE_NAME", "cafe_pos_session"))
      .build(),
  );
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "docs/openapi.json",
  });
  app.enableShutdownHooks();
  await app.listen(config.get<number>("API_PORT", 4000));
}

void bootstrap();
