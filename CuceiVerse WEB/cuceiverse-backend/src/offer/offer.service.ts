import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ReloadResponse {
  ok: boolean;
  running: boolean;
  message?: string;
  total?: number;
  materias?: Record<string, unknown>[];
  hasResult?: boolean;
  lastError?: string | null;
}

export interface SearchOfertaParams {
  q?: string;
  profesor?: string;
  materia?: string;
  edificio?: string;
  dia?: string;
  hora?: string;
  limit?: number;
}

export interface SearchOfertaResponse {
  total: number;
  error?: string;
  materias: Record<string, unknown>[];
}

@Injectable()
export class OfferService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfferService.name);
  private readonly horariosApiUrl: string;
  private readonly horariosApiPath: string;
  private readonly pythonBin: string | null;
  private uvicornProcess: ChildProcess | null = null;

  constructor(private readonly config: ConfigService) {
    const rawUrl = this.config.get<string>('HORARIOS_API_URL') ?? 'http://127.0.0.1:8020';
    this.horariosApiUrl = rawUrl.replace('localhost', '127.0.0.1');
    this.horariosApiPath =
      this.config.get<string>('HORARIOS_API_PATH') ??
      // En dev, el script corre desde cuceiverse-backend, así que esto resuelve a cuceiverse-backend/horarios-api
      path.resolve(process.cwd(), 'horarios-api');
    this.pythonBin = this.resolvePythonBin();
  }

  private resolvePythonBin(): string | null {
    const configuredBin = this.config.get<string>('HORARIOS_PYTHON_BIN')?.trim();
    const candidates = [configuredBin, 'python', 'python3'];

    for (const candidate of candidates) {
      if (!candidate) continue;

      try {
        const check = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
        if (check.status === 0) return candidate;
      } catch {
        // Ignorar y probar el siguiente binario.
      }
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────
  //  Lifecycle: arrancar y apagar uvicorn junto con el backend
  // ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.startUvicorn();
  }

  onModuleDestroy(): void {
    this.stopUvicorn();
  }

  private async startUvicorn(): Promise<void> {
    // 1. Verificar si ya hay algo corriendo en el puerto
    const alreadyUp = await this.isAlive();
    if (alreadyUp) {
      this.logger.log('Horarios API ya está corriendo en 8020. No se inicia un proceso nuevo.');
      return;
    }

    this.logger.log(`Iniciando Horarios API desde: ${this.horariosApiPath}`);

    if (!fs.existsSync(this.horariosApiPath)) {
      this.logger.error(
        `No existe HORARIOS_API_PATH ("${this.horariosApiPath}"). Configura HORARIOS_API_PATH o asegura que la carpeta horarios-api exista.`,
      );
      return;
    }

    if (!this.pythonBin) {
      this.logger.error(
        'No se encontro un ejecutable de Python. Configura HORARIOS_PYTHON_BIN o instala python3.',
      );
      return;
    }

    this.uvicornProcess = spawn(
      this.pythonBin,
      ['-m', 'uvicorn', 'main:app', '--port', '8020'],
      {
        cwd: this.horariosApiPath,
        // Heredar stdio para ver logs de Python en la consola de NestJS
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      },
    );

    this.uvicornProcess.stdout?.on('data', (data: Buffer) => {
      this.logger.verbose(`[HorariosAPI] ${data.toString().trim()}`);
    });

    this.uvicornProcess.stderr?.on('data', (data: Buffer) => {
      // uvicorn usa stderr para su INFO/WARNING logs; no siempre son errores reales
      this.logger.verbose(`[HorariosAPI] ${data.toString().trim()}`);
    });

    this.uvicornProcess.on('error', (error: Error) => {
      this.logger.error(`No se pudo iniciar Horarios API: ${error.message}`);
      this.uvicornProcess = null;
    });

    this.uvicornProcess.on('exit', (code, signal) => {
      this.logger.warn(`Horarios API terminó (code=${code}, signal=${signal})`);
      this.uvicornProcess = null;
    });

    // 2. Esperar hasta 15 segundos a que el servicio responda
    const started = await this.waitForService(15_000);
    if (started) {
      this.logger.log('✅ Horarios API iniciada correctamente en http://127.0.0.1:8020');
    } else {
      this.logger.warn('⚠️  Horarios API no respondió en 15s. Continuando de todas formas...');
    }
  }

  private stopUvicorn(): void {
    if (this.uvicornProcess && !this.uvicornProcess.killed) {
      this.logger.log('Deteniendo Horarios API...');
      this.uvicornProcess.kill('SIGTERM');
      this.uvicornProcess = null;
    }
  }

  /** Intenta conectarse cada 500ms hasta `timeoutMs` */
  private async waitForService(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.uvicornProcess) {
        return false;
      }
      if (await this.isAlive()) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private async isAlive(): Promise<boolean> {
    try {
      const res = await fetch(`${this.horariosApiUrl}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  API pública
  // ─────────────────────────────────────────────────────────────

  async reloadOffer(ciclo?: string, centro: string = 'D'): Promise<ReloadResponse> {
    const url = `${this.horariosApiUrl}/reload`;
    this.logger.log(`Iniciando scrape en background: POST ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciclo: ciclo ?? null, centro }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as ReloadResponse;
    } catch (err) {
      this.logger.error(`Error al iniciar Horarios API: ${err instanceof Error ? err.message : 'unknown'}`);
      throw new ServiceUnavailableException(
        'No se pudo iniciar el servicio de Horarios API. Verifica que esté corriendo en el puerto 8020.',
      );
    }
  }

  async getReloadStatus(): Promise<ReloadResponse> {
    const url = `${this.horariosApiUrl}/reload/status`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error();
      return await response.json() as ReloadResponse;
    } catch {
      return { ok: false, running: false, hasResult: false, lastError: 'Horarios API no responde' };
    }
  }

  async getCicloActual(): Promise<{ ciclo: string }> {
    const url = `${this.horariosApiUrl}/ciclo`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      return await response.json() as { ciclo: string };
    } catch {
      const now = new Date();
      const sufijo = now.getMonth() < 6 ? '10' : '20';
      return { ciclo: `${now.getFullYear()}${sufijo}` };
    }
  }

  async searchOferta(params: SearchOfertaParams): Promise<SearchOfertaResponse> {
    const url = new URL(`${this.horariosApiUrl}/search`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
    
    try {
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error();
      return await response.json() as SearchOfertaResponse;
    } catch {
      return { total: 0, materias: [], error: 'El servicio de búsqueda no responde' };
    }
  }
}
