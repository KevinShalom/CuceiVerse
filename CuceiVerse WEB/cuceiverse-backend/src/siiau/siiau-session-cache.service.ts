import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma';

import { PrismaService } from '../prisma/prisma.service';

import type { SiiauSnapshotDto } from './dto/siiau.dto';

type SessionSnapshotStatus = 'idle' | 'loading' | 'ready' | 'error';

type SessionSnapshotEntry = {
  status: SessionSnapshotStatus;
  snapshot: SiiauSnapshotDto | null;
  error: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
};

type SessionSnapshotView = {
  status: SessionSnapshotStatus;
  snapshot: SiiauSnapshotDto | null;
  error: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
};

const IDLE_ENTRY: SessionSnapshotEntry = {
  status: 'idle',
  snapshot: null,
  error: null,
  requestedAt: null,
  updatedAt: null,
};

const MAX_TRANSIENT_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;
const PREFETCH_ATTEMPT_TIMEOUT_MS = Number(
  process.env.SIIAU_PREFETCH_ATTEMPT_TIMEOUT_MS ?? 30_000,
);
const SESSION_SNAPSHOT_TTL_MS = Number(
  process.env.SIIAU_SESSION_SNAPSHOT_TTL_MS ?? 6 * 60 * 60 * 1000,
);

@Injectable()
export class SiiauSessionCacheService {
  private readonly logger = new Logger(SiiauSessionCacheService.name);
  private readonly debugFlow =
    (process.env.SIIAU_DEBUG_FLOW ?? 'true').toLowerCase() === 'true';

  constructor(private readonly prisma: PrismaService) {}

  private readonly entries = new Map<string, SessionSnapshotEntry>();
  private readonly refreshInFlight = new Set<string>();

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

  private getEntry(userId: string): SessionSnapshotEntry {
    return this.entries.get(userId) ?? IDLE_ENTRY;
  }

  private isFresh(updatedAt: string | null): boolean {
    if (!updatedAt) return false;
    if (!Number.isFinite(SESSION_SNAPSHOT_TTL_MS) || SESSION_SNAPSHOT_TTL_MS <= 0) {
      return false;
    }
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= SESSION_SNAPSHOT_TTL_MS;
  }

  private toView(entry: SessionSnapshotEntry): SessionSnapshotView {
    return {
      status: entry.status,
      snapshot: entry.snapshot,
      error: entry.error,
      requestedAt: entry.requestedAt,
      updatedAt: entry.updatedAt,
    };
  }

  private fromDbRow(row: {
    siiauSnapshot: Prisma.JsonValue | null;
    siiauSnapshotStatus: string | null;
    siiauSnapshotError: string | null;
    siiauSnapshotRequestedAt: Date | null;
    siiauSnapshotUpdatedAt: Date | null;
  }): SessionSnapshotEntry {
    const status =
      row.siiauSnapshotStatus === 'loading' ||
      row.siiauSnapshotStatus === 'ready' ||
      row.siiauSnapshotStatus === 'error' ||
      row.siiauSnapshotStatus === 'idle'
        ? row.siiauSnapshotStatus
        : 'idle';

    return {
      status,
      snapshot: (row.siiauSnapshot as SiiauSnapshotDto | null) ?? null,
      error: row.siiauSnapshotError,
      requestedAt: row.siiauSnapshotRequestedAt?.toISOString() ?? null,
      updatedAt: row.siiauSnapshotUpdatedAt?.toISOString() ?? null,
    };
  }

  private async persist(userId: string, entry: SessionSnapshotEntry): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          siiauSnapshot: entry.snapshot
            ? (entry.snapshot as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          siiauSnapshotStatus: entry.status,
          siiauSnapshotError: entry.error,
          siiauSnapshotRequestedAt: entry.requestedAt
            ? new Date(entry.requestedAt)
            : null,
          siiauSnapshotUpdatedAt: entry.updatedAt
            ? new Date(entry.updatedAt)
            : null,
        },
      });
    } catch {
      // Si la migracion aun no esta aplicada o hay un problema temporal de BD,
      // se mantiene comportamiento en memoria para no bloquear el login.
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async get(userId: string): Promise<SessionSnapshotView> {
    const memory = this.entries.get(userId);
    if (memory && (memory.status === 'loading' || memory.status === 'ready')) {
      this.logFlow('Session snapshot desde memoria', {
        userId: this.shortUserId(userId),
        status: memory.status,
        requestedAt: memory.requestedAt,
        updatedAt: memory.updatedAt,
      });
      return this.toView(memory);
    }

    try {
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          siiauSnapshot: true,
          siiauSnapshotStatus: true,
          siiauSnapshotError: true,
          siiauSnapshotRequestedAt: true,
          siiauSnapshotUpdatedAt: true,
        },
      });

      if (!row) {
        return this.toView(memory ?? IDLE_ENTRY);
      }

      const dbEntry = this.fromDbRow(row);
      this.entries.set(userId, dbEntry);
      this.logFlow('Session snapshot desde BD', {
        userId: this.shortUserId(userId),
        status: dbEntry.status,
        requestedAt: dbEntry.requestedAt,
        updatedAt: dbEntry.updatedAt,
      });
      return this.toView(dbEntry);
    } catch {
      this.logFlow('Session snapshot fallback por error de lectura BD', {
        userId: this.shortUserId(userId),
        status: (memory ?? IDLE_ENTRY).status,
      });
      return this.toView(memory ?? IDLE_ENTRY);
    }
  }

  startPrefetch(
    userId: string,
    fetcher: () => Promise<SiiauSnapshotDto>,
  ): void {
    void this.startPrefetchAsync(userId, fetcher);
  }

  private async startPrefetchAsync(
    userId: string,
    fetcher: () => Promise<SiiauSnapshotDto>,
  ): Promise<void> {
    const memory = this.entries.get(userId);
    if (memory?.status === 'loading') {
      this.logFlow('Prefetch omitido: ya estaba loading', {
        userId: this.shortUserId(userId),
        requestedAt: memory.requestedAt,
      });
      return;
    }

    if (this.refreshInFlight.has(userId)) {
      this.logFlow('Prefetch omitido: refresh ya en vuelo', {
        userId: this.shortUserId(userId),
      });
      return;
    }

    let baseEntry: SessionSnapshotEntry = memory ?? IDLE_ENTRY;

    // Si no tenemos snapshot en memoria, intenta recuperar de BD para evitar
    // recargar siempre desde SIIAU en cada login.
    if (!(baseEntry.status === 'ready' && baseEntry.snapshot)) {
      try {
        const row = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            siiauSnapshot: true,
            siiauSnapshotStatus: true,
            siiauSnapshotError: true,
            siiauSnapshotRequestedAt: true,
            siiauSnapshotUpdatedAt: true,
          },
        });
        if (row) {
          baseEntry = this.fromDbRow(row);
          this.entries.set(userId, baseEntry);
        }
      } catch {
        // ignore: se mantiene baseEntry como estaba
      }
    }

    const hasSnapshot = baseEntry.status === 'ready' && !!baseEntry.snapshot;
    if (hasSnapshot && this.isFresh(baseEntry.updatedAt)) {
      this.logFlow('Prefetch omitido: snapshot fresco (TTL)', {
        userId: this.shortUserId(userId),
        updatedAt: baseEntry.updatedAt,
        ttlMs: SESSION_SNAPSHOT_TTL_MS,
      });
      return;
    }

    const now = new Date().toISOString();

    if (hasSnapshot) {
      // Stale-while-revalidate: manten el snapshot actual listo y refresca en background.
      this.refreshInFlight.add(userId);
      this.logFlow('Prefetch refresh iniciado (stale-while-revalidate)', {
        userId: this.shortUserId(userId),
        baseUpdatedAt: baseEntry.updatedAt,
        requestedAt: now,
      });

      this.runPrefetchAttempt(userId, now, 0, fetcher, {
        mode: 'refresh',
      });
      return;
    }

    const loadingEntry: SessionSnapshotEntry = {
      status: 'loading',
      snapshot: null,
      error: null,
      requestedAt: now,
      updatedAt: now,
    };

    this.entries.set(userId, loadingEntry);
    void this.persist(userId, loadingEntry);
    this.logFlow('Prefetch iniciado', {
      userId: this.shortUserId(userId),
      requestedAt: now,
    });

    this.runPrefetchAttempt(userId, now, 0, fetcher, {
      mode: 'initial',
    });
  }

  private endRefresh(userId: string): void {
    if (!this.refreshInFlight.has(userId)) return;
    this.refreshInFlight.delete(userId);
  }

  private runPrefetchAttempt(
    userId: string,
    requestedAt: string,
    attempt: number,
    fetcher: () => Promise<SiiauSnapshotDto>,
    options: { mode: 'initial' | 'refresh' },
  ) {
    this.logFlow('Prefetch intento', {
      userId: this.shortUserId(userId),
      attempt,
      requestedAt,
    });

    void this.withTimeout(
      fetcher(),
      PREFETCH_ATTEMPT_TIMEOUT_MS,
      `Prefetch SIIAU excedio ${PREFETCH_ATTEMPT_TIMEOUT_MS}ms`,
    )
      .then((snapshot) => {
        const updatedAt = new Date().toISOString();
        const readyEntry: SessionSnapshotEntry = {
          status: 'ready',
          snapshot,
          error: null,
          requestedAt,
          updatedAt,
        };

        this.entries.set(userId, readyEntry);
        void this.persist(userId, readyEntry);
        if (options.mode === 'refresh') {
          this.endRefresh(userId);
        }
        this.logFlow('Prefetch ready', {
          userId: this.shortUserId(userId),
          attempt,
          pidm: snapshot.pidm,
          carrera: snapshot.carrera_value,
          totalCourses: snapshot.stats?.total_courses,
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'No fue posible consultar SIIAU';

        const isInvalidCredentials =
          /credenciales siiau invalidas|invalid credentials/i.test(message);

        if (!isInvalidCredentials && attempt < MAX_TRANSIENT_RETRIES) {
          const updatedAt = new Date().toISOString();
          if (options.mode === 'initial') {
            const retryingEntry: SessionSnapshotEntry = {
              status: 'loading',
              snapshot: null,
              error: null,
              requestedAt,
              updatedAt,
            };
            this.entries.set(userId, retryingEntry);
            void this.persist(userId, retryingEntry);
          }
          this.logFlow('Prefetch retry programado', {
            userId: this.shortUserId(userId),
            attempt,
            delayMs: RETRY_BASE_DELAY_MS * (attempt + 1),
            error: message,
          });

          const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
          setTimeout(() => {
            this.runPrefetchAttempt(userId, requestedAt, attempt + 1, fetcher, options);
          }, delay);
          return;
        }

        if (options.mode === 'refresh') {
          // No invalidar el snapshot existente por un refresh fallido.
          this.endRefresh(userId);
          this.logFlow('Prefetch refresh fallo (se conserva snapshot previo)', {
            userId: this.shortUserId(userId),
            attempt,
            error: message,
          });
          return;
        }

        const updatedAt = new Date().toISOString();
        const failedEntry: SessionSnapshotEntry = {
          status: 'error',
          snapshot: null,
          error: message,
          requestedAt,
          updatedAt,
        };

        this.entries.set(userId, failedEntry);
        void this.persist(userId, failedEntry);
        this.logFlow('Prefetch error terminal', {
          userId: this.shortUserId(userId),
          attempt,
          error: message,
        });
      });
  }
}
