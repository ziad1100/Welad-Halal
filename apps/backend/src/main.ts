import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  // Section 3 — real-time alerts ride the same HTTP server over Socket.io
  // (AlertsGateway); the underlying HTTP adapter must be exposed for it.
  const httpAdapter = app.getHttpAdapter();
  void httpAdapter;
  app.useGlobalPipes(
  // forbidNonWhitelisted: reject unknown fields instead of silently
  // dropping them (all frontend payloads audited against DTOs).
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim());
  app.enableCors({ origin: corsOrigin, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Welad Halal POS API')
    .setDescription('Retail POS / Order Management / ERP — Auth, Products, Orders, Inventory, Reports')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  // Swagger is a dev/operator tool — never expose it unauthenticated in production.
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, doc);
  }

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Welad Halal backend listening on :${port}`);
}
bootstrap();
