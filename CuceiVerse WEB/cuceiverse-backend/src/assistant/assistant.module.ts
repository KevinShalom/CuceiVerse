import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { MapaModule } from '../mapa/mapa.module';
import { SiiauModule } from '../siiau/siiau.module';
import { OfferModule } from '../offer/offer.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { NlpService } from './nlp.service';

@Module({
  imports: [PrismaModule, MapaModule, SiiauModule, OfferModule],
  controllers: [AssistantController],
  providers: [AssistantService, NlpService],
  exports: [AssistantService, NlpService],
})
export class AssistantModule {}
