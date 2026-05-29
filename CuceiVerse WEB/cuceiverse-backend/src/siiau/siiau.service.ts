import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SIIAU_PROVIDER } from './siiau.provider';
import type { SiiauProvider } from './siiau.provider';
import type {
  SiiauSnapshotDto,
  SiiauSnapshotRequestDto,
} from './dto/siiau.dto';
import { SiiauSessionCacheService } from './siiau-session-cache.service';

@Injectable()
export class SiiauService {
  private readonly logger = new Logger(SiiauService.name);
  private readonly debugFlow =
    (process.env.SIIAU_DEBUG_FLOW ?? 'true').toLowerCase() === 'true';

  constructor(
    @Inject(SIIAU_PROVIDER) private readonly provider: SiiauProvider,
    private readonly sessionCache: SiiauSessionCacheService,
  ) {}

  private shortUserId(userId: string): string {
    if (!userId) return userId;
    return userId.length <= 8 ? userId : `${userId.slice(0, 8)}...`;
  }

  private logFlow(message: string, meta?: Record<string, unknown>): void {
    if (!this.debugFlow) return;
    if (meta) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
      return;
    }
    this.logger.log(message);
  }

  status() {
    return { ok: true, mode: process.env.SIIAU_MODE ?? 'real' };
  }

  validateCredentials(input: {
    codigo: string;
    nip: string;
  }): Promise<{ ok: boolean; displayName?: string | null }> {
    return this.provider.validateCredentials(input);
  }

  fetchSnapshot(input: SiiauSnapshotRequestDto): Promise<SiiauSnapshotDto> {
    this.logFlow('fetchSnapshot solicitado', {
      codigo: input.codigo.length <= 4 ? input.codigo : `***${input.codigo.slice(-4)}`,
      carreraPrefer: input.carreraPrefer ?? null,
      cicloPrefer: input.cicloPrefer ?? null,
    });

    return this.provider.fetchSnapshot(input).catch((error: unknown) => {
      this.logFlow('fetchSnapshot fallo', {
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (error instanceof Error) {
        if (/credenciales incorrectas|invalid credentials/i.test(error.message)) {
          throw new UnauthorizedException('Credenciales SIIAU invalidas');
        }
      }

      throw new ServiceUnavailableException('No fue posible consultar SIIAU');
    });
  }

  prefetchSessionSnapshot(
    userId: string,
    input: SiiauSnapshotRequestDto,
  ): void {
    this.logFlow('prefetchSessionSnapshot start', {
      userId: this.shortUserId(userId),
      codigo: input.codigo.length <= 4 ? input.codigo : `***${input.codigo.slice(-4)}`,
    });
    this.sessionCache.startPrefetch(userId, () => this.fetchSnapshot(input));
  }

  getSessionSnapshot(userId: string) {
    this.logFlow('getSessionSnapshot', {
      userId: this.shortUserId(userId),
    });
    return this.sessionCache.get(userId);
  }
}
