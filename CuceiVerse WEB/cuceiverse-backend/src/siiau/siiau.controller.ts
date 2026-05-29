import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { SiiauService } from './siiau.service';
import type { SiiauSnapshotRequestDto } from './dto/siiau.dto';
import { SiiauSnapshotMeRequestDto } from './dto/siiau-me.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    siiauCode: string;
  };
};

@Controller('siiau')
@UseGuards(AuthGuard('jwt'))
export class SiiauController {
  constructor(private readonly siiau: SiiauService) {}

  @Get('status')
  status() {
    return this.siiau.status();
  }

  @Post('snapshot')
  snapshot(@Body() body: SiiauSnapshotRequestDto) {
    return this.siiau.fetchSnapshot(body);
  }

  @Post('snapshot/me')
  snapshotMe(
    @Req() req: AuthenticatedRequest,
    @Body() body: SiiauSnapshotMeRequestDto,
  ) {
    return this.siiau.fetchSnapshot({
      codigo: req.user.siiauCode,
      nip: body.nip,
      carreraPrefer: body.carreraPrefer,
      cicloPrefer: body.cicloPrefer,
    });
  }

  @Get('session-snapshot')
  getSessionSnapshot(@Req() req: AuthenticatedRequest) {
    return this.siiau.getSessionSnapshot(req.user.id);
  }
}
