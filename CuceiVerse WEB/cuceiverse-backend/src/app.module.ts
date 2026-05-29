import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { SiiauModule } from './siiau/siiau.module';
import { PuntosInteresModule } from './puntos-interes/puntos-interes.module';
import { MapaModule } from './mapa/mapa.module';
import { AssistantModule } from './assistant/assistant.module';
import { OfferModule } from './offer/offer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SiiauModule,
    PuntosInteresModule,
    MapaModule,
    AssistantModule,
    OfferModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
