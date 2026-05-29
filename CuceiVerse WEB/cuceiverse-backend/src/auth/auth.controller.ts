import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateAvatarDto } from './dto/update-avatar.dto';

type ReqUser = {
  id: string;
  siiauCode: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AuthenticatedRequest = Request & { user: ReqUser };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar')
  updateAvatar(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateAvatarDto,
  ) {
    return this.auth.updateAvatar(req.user.id, dto.avatarUrl ?? null);
  }
}
