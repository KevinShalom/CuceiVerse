import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';

@Module({
  imports: [ConfigModule],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
