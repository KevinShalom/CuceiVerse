import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Evitar 413 (Request Entity Too Large) al guardar layouts grandes.
  // Ajustable por env para producción.
  const bodyLimit = process.env.BODY_LIMIT ?? '200mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
