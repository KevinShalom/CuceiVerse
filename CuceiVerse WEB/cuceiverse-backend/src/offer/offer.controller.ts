import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OfferService } from './offer.service';

class ReloadOfferDto {
  ciclo?: string;
  centro?: string;
}

@Controller('offer')
@UseGuards(AuthGuard('jwt'))
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  /**
   * POST /offer/reload
   * Dispara un nuevo scraping de la oferta académica en Horarios API.
   * Requiere JWT. Puede tardar varios minutos.
   */
  @Post('reload')
  async reload(@Body() body: ReloadOfferDto) {
    return this.offerService.reloadOffer(body.ciclo, body.centro ?? 'D');
  }

  /**
   * GET /offer/reload/status
   * Retorna si hay un scraping en progreso.
   */
  @Get('reload/status')
  async reloadStatus() {
    return this.offerService.getReloadStatus();
  }

  /**
   * GET /offer/ciclo
   * Retorna el ciclo escolar actual calculado.
   */
  @Get('ciclo')
  async cicloActual() {
    return this.offerService.getCicloActual();
  }
}
