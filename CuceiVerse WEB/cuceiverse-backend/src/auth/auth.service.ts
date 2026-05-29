import {
  ConflictException,
  Logger,
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';

import { PrismaService } from '../prisma/prisma.service';
import { SiiauService } from '../siiau/siiau.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { isAdminSiiauCode } from './admin-codes.constants';

type PublicUser = {
  id: string;
  siiauCode: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AuthUserWithPassword = PublicUser & {
  passwordHash: string;
};

type UserIdAndCode = Pick<PublicUser, 'id' | 'siiauCode'>;

const publicUserSelect = {
  id: true,
  siiauCode: true,
  displayName: true,
  avatarUrl: true,
  isAdmin: true,
  createdAt: true,
  updatedAt: true,
} as const;

const authUserWithPasswordSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

const FAST_LOGIN_CACHE_TTL_MS = Number(
  process.env.AUTH_FAST_LOGIN_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000,
);

type FastLoginCacheEntry = {
  validatedAt: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly debugFlow =
    (process.env.SIIAU_DEBUG_FLOW ?? 'true').toLowerCase() === 'true';
  private readonly fastLoginCache = new Map<string, FastLoginCacheEntry>();

  private readonly testAdminEnabled = (() => {
    const raw = process.env.AUTH_TEST_ADMIN_ENABLED;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.toLowerCase().trim() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
  })();

  private readonly testAdminCode = (process.env.AUTH_TEST_ADMIN_CODE ?? 'admin')
    .toString()
    .trim();

  private readonly testAdminNip = (process.env.AUTH_TEST_ADMIN_NIP ?? 'admin123')
    .toString()
    .trim();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly siiau: SiiauService,
  ) {}

  private maskCode(code: string): string {
    const clean = code.trim();
    if (clean.length <= 4) return clean;
    return `***${clean.slice(-4)}`;
  }

  private logFlow(message: string, meta?: Record<string, unknown>): void {
    if (!this.debugFlow) return;
    if (meta) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
      return;
    }
    this.logger.log(message);
  }

  private async signAccessToken(
    user: UserIdAndCode & { isAdmin: boolean },
  ): Promise<string> {
    const expiresInRaw = this.config.get<string>('JWT_EXPIRES_IN');
    const expiresIn =
      expiresInRaw && /^\d+$/.test(expiresInRaw)
        ? Number(expiresInRaw)
        : ((expiresInRaw ?? '7d') as StringValue);
    return this.jwt.signAsync(
      { sub: user.id, siiauCode: user.siiauCode, isAdmin: user.isAdmin },
      { expiresIn },
    );
  }

  private getFastLoginCache(code: string): FastLoginCacheEntry | null {
    const entry = this.fastLoginCache.get(code);
    if (!entry) return null;
    if (!Number.isFinite(FAST_LOGIN_CACHE_TTL_MS) || FAST_LOGIN_CACHE_TTL_MS <= 0) {
      this.fastLoginCache.delete(code);
      return null;
    }
    if (Date.now() - entry.validatedAt > FAST_LOGIN_CACHE_TTL_MS) {
      this.fastLoginCache.delete(code);
      return null;
    }
    return entry;
  }

  private setFastLoginCache(code: string): void {
    this.fastLoginCache.set(code, { validatedAt: Date.now() });
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { siiauCode: dto.siiauCode },
      select: { id: true },
    });
    if (exists) throw new ConflictException('siiauCode already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = (await this.prisma.user.create({
      data: {
        siiauCode: dto.siiauCode,
        passwordHash,
        displayName: dto.displayName,
        isAdmin: isAdminSiiauCode(dto.siiauCode),
      },
      select: publicUserSelect,
    })) as PublicUser;

    const accessToken = await this.signAccessToken(user);
    return { accessToken, user };
  }

  async login(dto: LoginDto) {
    const loginCode = dto.codigo.trim();
    const loginNip = dto.nip.trim();
    const shouldBeAdmin = isAdminSiiauCode(loginCode);
    const existingUser = (await this.prisma.user.findUnique({
      where: { siiauCode: loginCode },
      select: authUserWithPasswordSelect,
    })) as AuthUserWithPassword | null;

    this.logFlow('Login request recibido', {
      codigo: this.maskCode(loginCode),
      shouldBeAdmin,
    });

    const cachedFastLogin = this.getFastLoginCache(loginCode);
    if (existingUser && cachedFastLogin) {
      const passwordMatches = await bcrypt.compare(
        loginNip,
        existingUser.passwordHash,
      );

      if (passwordMatches) {
        this.logFlow('Login fast-path cache hit', {
          codigo: this.maskCode(loginCode),
          validatedAt: new Date(cachedFastLogin.validatedAt).toISOString(),
        });

        const accessToken = await this.signAccessToken(existingUser);
        this.setFastLoginCache(loginCode);
        return {
          accessToken,
          user: {
            id: existingUser.id,
            siiauCode: existingUser.siiauCode,
            displayName: existingUser.displayName,
            avatarUrl: existingUser.avatarUrl,
            isAdmin: existingUser.isAdmin,
            createdAt: existingUser.createdAt,
            updatedAt: existingUser.updatedAt,
          },
        };
      }
    }

    // Local-only escape hatch: allow a temporary admin login without calling SIIAU.
    // Enabled by default when NODE_ENV != production (can be disabled explicitly).
    if (
      this.testAdminEnabled &&
      this.testAdminCode.length > 0 &&
      this.testAdminNip.length > 0 &&
      loginCode === this.testAdminCode &&
      loginNip === this.testAdminNip
    ) {
      this.logFlow('Login admin temporal (local) aceptado', {
        codigo: this.maskCode(loginCode),
      });

      const passwordHash = await bcrypt.hash(loginNip, 10);
      const user = (await this.prisma.user.upsert({
        where: { siiauCode: loginCode },
        update: {
          passwordHash,
          isAdmin: true,
          displayName: 'Admin (local)',
        },
        create: {
          siiauCode: loginCode,
          passwordHash,
          displayName: 'Admin (local)',
          isAdmin: true,
        },
        select: publicUserSelect,
      })) as PublicUser;

      const accessToken = await this.signAccessToken(user);
      this.setFastLoginCache(loginCode);
      return { accessToken, user };
    }

    try {
      const validation = await this.siiau.validateCredentials({
        codigo: loginCode,
        nip: loginNip,
      });

      if (!validation.ok) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const passwordHash = await bcrypt.hash(loginNip, 10);

      const user = (await this.prisma.user.upsert({
        where: { siiauCode: loginCode },
        update: {
          passwordHash,
          isAdmin: shouldBeAdmin,
          ...(validation.displayName
            ? { displayName: validation.displayName }
            : {}),
        },
        create: {
          siiauCode: loginCode,
          passwordHash,
          displayName: validation.displayName ?? null,
          isAdmin: shouldBeAdmin,
        },
        select: publicUserSelect,
      })) as PublicUser;

      this.logFlow('Login SIIAU validado y usuario resuelto', {
        userId: user.id,
        siiauCode: user.siiauCode,
        codigoSolicitado: this.maskCode(loginCode),
      });

      const accessToken = await this.signAccessToken(user);
      this.setFastLoginCache(loginCode);

      setTimeout(() => {
        try {
          this.siiau.prefetchSessionSnapshot(user.id, {
            codigo: loginCode,
            nip: loginNip,
          });

          this.logFlow('Prefetch SIIAU disparado', {
            userId: user.id,
            siiauCode: user.siiauCode,
          });
        } catch (prefetchError) {
          this.logFlow('Prefetch SIIAU fallo al disparar', {
            userId: user.id,
            siiauCode: user.siiauCode,
            error:
              prefetchError instanceof Error
                ? prefetchError.message
                : 'unknown',
          });
        }
      }, 0);

      return { accessToken, user };
    } catch (error) {
      this.logFlow('Login SIIAU fallo', {
        codigo: this.maskCode(loginCode),
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof Error) {
        if (
          /credenciales incorrectas|invalid credentials/i.test(error.message)
        ) {
          throw new UnauthorizedException('Invalid credentials');
        }
      }

      throw new InternalServerErrorException(
        'No fue posible validar credenciales con SIIAU',
      );
    }
  }

  async updateAvatar(userId: string, avatarUrl: string | null) {
    const nextAvatar = avatarUrl?.trim() ? avatarUrl.trim() : null;

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: nextAvatar },
      select: publicUserSelect,
    });
  }
}
