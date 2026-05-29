import { Injectable, Logger } from '@nestjs/common';
import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { CookieJar } from 'tough-cookie';
import * as https from 'node:https';

import type { SiiauProvider } from '../siiau.provider';
import type {
  SiiauSnapshotDto,
  SiiauSnapshotRequestDto,
} from '../dto/siiau.dto';
import { parseRegistroLista } from '../parsers/registro-lista.parser';
import { parseOferta } from '../parsers/oferta.parser';
import {
  extractMojarraPairs,
  extractViewState,
  findFormByName,
  parseFrames,
  patchMajrp,
  resolveCicloFromSelect,
  shouldApplyRevisaCarrera,
  urlFromJs,
  loadHtml,
  textOf,
  urlJoin,
} from '../parsers/html.util';

@Injectable()
export class SiiauRealProvider implements SiiauProvider {
  private readonly logger = new Logger(SiiauRealProvider.name);
  private readonly http: AxiosInstance;
  private jar: CookieJar;

  private readonly URL_LOGIN = 'https://mw.siiau.udg.mx/Portal/login.xhtml';
  private readonly BASE_ESCOLAR = 'https://siiauescolar.siiau.udg.mx';
  private readonly WUS = `${this.BASE_ESCOLAR}/wus`;
  private readonly WAL = `${this.BASE_ESCOLAR}/wal`;
  private readonly URL_EMICORE = `${this.WUS}/gupprincipal.emicore`;

  private readonly timeoutMs: number;
  private readonly verifyTls: boolean;
  private readonly minSleepMs: number;
  private readonly maxSleepMs: number;
  private readonly debugProfile: boolean;
  private readonly debugFlow: boolean;
  private flowQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.timeoutMs = Number(process.env.SIIAU_TIMEOUT_MS ?? 25_000);
    this.verifyTls =
      (process.env.SIIAU_VERIFY_TLS ?? 'true').toLowerCase() === 'true';
    this.minSleepMs = Number(process.env.SIIAU_MIN_SLEEP_MS ?? 200);
    this.maxSleepMs = Number(process.env.SIIAU_MAX_SLEEP_MS ?? 700);
    this.debugProfile =
      (process.env.SIIAU_DEBUG_PROFILE ?? 'false').toLowerCase() === 'true';
    this.debugFlow =
      (process.env.SIIAU_DEBUG_FLOW ?? 'true').toLowerCase() === 'true';

    this.jar = new CookieJar();
    const httpsAgent = new https.Agent({ rejectUnauthorized: this.verifyTls });

    this.http = axios.create({
      timeout: this.timeoutMs,
      httpsAgent,
      maxRedirects: 5,
      validateStatus: (s) => (s >= 200 && s < 400) || s === 302,
    });

    this.http.interceptors.request.use(async (config) => {
      const abs = this.resolveAbsoluteUrlFromConfig(config.baseURL, config.url);
      if (abs) {
        const cookie = await this.jar.getCookieString(abs);
        if (cookie) {
          this.setCookieHeader(config, cookie);
        }
      }

      return config;
    });

    // Store cookies from response
    this.http.interceptors.response.use(async (res) => {
      const abs =
        this.getFinalUrl(res) ??
        this.resolveAbsoluteUrlFromConfig(res.config.baseURL, res.config.url);
      const setCookie = res.headers['set-cookie'];

      if (abs && setCookie) {
        const cookies = Array.isArray(setCookie)
          ? setCookie
          : [String(setCookie)];
        for (const c of cookies) {
          try {
            await this.jar.setCookie(c, abs);
          } catch {
            // ignore cookie parse errors
          }
        }
      }

      return res;
    });
  }

  async fetchSnapshot(
    input: SiiauSnapshotRequestDto,
  ): Promise<SiiauSnapshotDto> {
    return this.withSerializedFlow(async () => {
      const { codigo, nip, carreraPrefer, cicloPrefer } = input;
      const flowId = this.newFlowId('snapshot', codigo);

      this.resetSession(flowId, 'fetchSnapshot');
      this.logFlow(flowId, 'Inicio fetchSnapshot', {
        codigo: this.maskCode(codigo),
        carreraPrefer: carreraPrefer ?? null,
        cicloPrefer: cicloPrefer ?? null,
      });

      const dashboardHtml = await this.loginMw(codigo, nip, flowId);
      const entry = await this.jumpToEscolar(dashboardHtml);

      const { pidm, menuHtml, menuUrl } = await this.openMenuSistemaAndPidm(
        entry.url,
        entry.html,
      );

      const alumnos = await this.goToAlumnosUni(menuUrl, menuHtml);

      const registroMenu = await this.openByText(
        alumnos.url,
        alumnos.html,
        'REGISTRO',
        carreraPrefer,
      );

      const profile = await this.buildAcademicProfileFromBoletaKardex(
        alumnos.url,
        alumnos.html,
        carreraPrefer,
      );

      const lista = await this.openByText(
        registroMenu.url,
        registroMenu.html,
        'Lista',
        carreraPrefer,
      );

      const { courses } = parseRegistroLista(lista.html);

      const selectedCareer = this.setSelectedCarreraFromPage(
        alumnos.html,
        carreraPrefer,
      );
      const careerSeed = carreraPrefer ?? selectedCareer.carreraValue ?? undefined;
      const { majrp, ciclo } = this.resolveCareer(careerSeed, cicloPrefer);
      if (!majrp) {
        throw new Error(
          'No pude resolver majrp. Selecciona una carrera activa en SIIAU o usa carreraPrefer como INNI-202210.',
        );
      }

      if (!courses.length) {
        const pageAverage = this.extractAverageFromPages(
          dashboardHtml,
          alumnos.html,
          registroMenu.html,
          lista.html,
        );
        const average = profile?.average ?? pageAverage;
        const emptyOutput: SiiauSnapshotDto = {
          timestamp: new Date().toISOString(),
          pidm,
          carrera_value: careerSeed ?? null,
          majrp,
          ciclo: ciclo ?? null,
          average,
          profile: profile
            ? {
                ...profile,
                average,
                careerName: profile.careerName ?? careerSeed ?? null,
              }
            : undefined,
          courses: [],
          stats: {
            total_courses: 0,
            with_schedule: 0,
            missing_schedule: 0,
          },
        };

        this.logFlow(flowId, 'Lista sin cursos, retorno snapshot vacio', {
          pidm,
          carrera: emptyOutput.carrera_value,
          majrp: emptyOutput.majrp,
        });

        return emptyOutput;
      }

      const oferta = await this.fetchOferta(
        pidm,
        majrp,
        ciclo ?? '202210',
        lista.url,
      );
      const ofertaParsed = parseOferta(oferta.html);
      const pageAverage = this.extractAverageFromPages(
        dashboardHtml,
        alumnos.html,
        registroMenu.html,
        lista.html,
        oferta.html,
      );
      const average = profile?.average ?? pageAverage;

      const ofertaMap = new Map<string, (typeof ofertaParsed.rows)[number]>();
      for (const r of ofertaParsed.rows) ofertaMap.set(r.nrc, r);

      const merged = courses.map((c) => {
        const row = ofertaMap.get(c.nrc);
        if (!row) return { ...c, warnings: ['NRC_NOT_FOUND_IN_OFERTA'] };

        return {
          ...c,
          sec: row.sec ?? null,
          sessions: row.sessions ?? [],
          profesor: row.profesor ?? null,
          warnings: [],
        };
      });

      const withSchedule = merged.filter(
        (c) => (c.sessions?.length ?? 0) > 0,
      ).length;

      const output: SiiauSnapshotDto = {
        timestamp: new Date().toISOString(),
        pidm,
        carrera_value: careerSeed ?? null,
        majrp,
        ciclo: ciclo ?? null,
        average,
        profile: profile
          ? {
              ...profile,
              average,
              careerName: profile.careerName ?? careerSeed ?? null,
            }
          : undefined,
        courses: merged,
        stats: {
          total_courses: merged.length,
          with_schedule: withSchedule,
          missing_schedule: merged.length - withSchedule,
        },
      };

      this.logFlow(flowId, 'Fin fetchSnapshot', {
        pidm,
        carrera: output.carrera_value,
        majrp: output.majrp,
        totalCourses: output.stats.total_courses,
      });

      return output;
    });
  }

  async validateCredentials(input: {
    codigo: string;
    nip: string;
  }): Promise<{ ok: boolean; displayName?: string | null }> {
    return this.withSerializedFlow(async () => {
      const flowId = this.newFlowId('validate', input.codigo);
      this.resetSession(flowId, 'validateCredentials');
      this.logFlow(flowId, 'Inicio validateCredentials', {
        codigo: this.maskCode(input.codigo),
      });

      await this.loginMwValidateOnly(input.codigo, input.nip, flowId);

      this.logFlow(flowId, 'validateCredentials OK', {
        codigo: this.maskCode(input.codigo),
      });
      return { ok: true, displayName: null };
    });
  }

  private async loginMwValidateOnly(
    codigo: string,
    nip: string,
    flowId = 'validate-login',
  ): Promise<void> {
    this.logFlow(flowId, 'Login MW inicio (validate-only)', {
      codigo: this.maskCode(codigo),
    });

    await this.sleepJitter();
    const rGet = await this.http.get(this.URL_LOGIN, {
      headers: { Referer: this.URL_LOGIN },
    });
    const htmlGet = rGet.data as string;

    const viewState = extractViewState(htmlGet);
    if (!viewState) {
      throw new Error('No se pudo obtener javax.faces.ViewState en login.');
    }

    const $ = loadHtml(htmlGet);
    let btnName = '';
    $('button')
      .toArray()
      .forEach((b) => {
        const t = textOf($(b));
        if (t.includes('Aceptar')) btnName = ($(b).attr('name') ?? '').trim();
      });

    const payload: Record<string, string> = {
      'javax.faces.ViewState': viewState,
      loginForm: 'loginForm',
      'loginForm:codigo': codigo,
      'loginForm:password': nip,
    };
    if (btnName) payload[btnName] = 'Aceptar';

    await this.sleepJitter();
    const rPost = await this.http.post(
      this.URL_LOGIN,
      new URLSearchParams(payload),
      {
        maxRedirects: 0,
        headers: {
          Referer: this.URL_LOGIN,
          Origin: 'https://mw.siiau.udg.mx',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (rPost.status === 302) {
      const loc = (rPost.headers['location'] as string | undefined) ?? '';
      if (!loc || /login\.xhtml/i.test(loc)) {
        throw new Error('Credenciales incorrectas (login no avanzó).');
      }

      this.logFlow(flowId, 'Login MW OK por redirect (validate-only)', {
        status: rPost.status,
        location: loc,
      });
      return;
    }

    const htmlPost = rPost.data as string;
    if ((htmlPost ?? '').includes('name="loginForm:password"')) {
      throw new Error('Credenciales incorrectas (login no avanzó).');
    }

    this.logFlow(flowId, 'Login MW OK por respuesta HTML (validate-only)', {
      status: rPost.status,
    });
  }

  private async withSerializedFlow<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.flowQueue;
    let release: () => void = () => undefined;
    this.flowQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await fn();
    } finally {
      release();
    }
  }

  private newFlowId(prefix: string, codigo: string): string {
    const token = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${this.maskCode(codigo)}-${token}`;
  }

  private maskCode(code: string): string {
    const clean = code.trim();
    if (clean.length <= 4) return clean;
    return `***${clean.slice(-4)}`;
  }

  private logFlow(flowId: string, message: string, meta?: Record<string, unknown>): void {
    if (!this.debugFlow) return;
    if (meta) {
      this.logger.log(`[${flowId}] ${message} ${JSON.stringify(meta)}`);
      return;
    }
    this.logger.log(`[${flowId}] ${message}`);
  }

  private resetSession(flowId: string, reason: string): void {
    this.jar = new CookieJar();
    this.logFlow(flowId, 'CookieJar reiniciado', { reason });
  }

  // ---------------- helpers ----------------
  private async sleepJitter(): Promise<void> {
    const ms = Math.floor(
      this.minSleepMs + Math.random() * (this.maxSleepMs - this.minSleepMs),
    );
    await new Promise((r) => setTimeout(r, ms));
  }

  private setCookieHeader(
    config: InternalAxiosRequestConfig,
    cookie: string,
  ): void {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Cookie', cookie);
    config.headers = headers;
  }

  private resolveAbsoluteUrlFromConfig(
    baseURL?: string,
    url?: string,
  ): string | undefined {
    if (!url) return undefined;
    if (URL.canParse(url)) {
      return url;
    }
    if (!baseURL) return undefined;
    return urlJoin(baseURL, url);
  }

  private getFinalUrl(res: AxiosResponse): string | undefined {
    const req = res.request as unknown;
    if (typeof req !== 'object' || req === null) return undefined;

    const reqObj = req as { res?: unknown };
    const inner = reqObj.res;
    if (typeof inner !== 'object' || inner === null) return undefined;

    const innerObj = inner as { responseUrl?: unknown };
    return typeof innerObj.responseUrl === 'string'
      ? innerObj.responseUrl
      : undefined;
  }

  private resolveCareer(
    carreraPrefer?: string,
    cicloPrefer?: string,
  ): { majrp: string; ciclo?: string } {
    if (carreraPrefer && carreraPrefer.includes('-')) {
      const [majrp, ciclo] = carreraPrefer.split('-', 2);
      return { majrp, ciclo: cicloPrefer ?? ciclo };
    }
    return { majrp: (carreraPrefer ?? '').trim(), ciclo: cicloPrefer };
  }

  private extractAverageFromPages(...pages: string[]): number | null {
    for (const html of pages) {
      const text = textOf(loadHtml(html).root()).replace(/\s+/g, ' ');
      const match = text.match(/promedio[^0-9]{0,20}(\d{1,2}(?:[\.,]\d{1,2})?)/i);
      if (!match?.[1]) continue;

      const normalized = match[1].replace(',', '.');
      const value = Number(normalized);
      if (!Number.isFinite(value)) continue;
      if (value < 0 || value > 100) continue;
      return Number(value.toFixed(2));
    }

    return null;
  }

  private async buildAcademicProfileFromBoletaKardex(
    alumnosUrl: string,
    alumnosHtml: string,
    carreraPrefer?: string,
  ): Promise<SiiauSnapshotDto['profile'] | null> {
    if (this.debugProfile) {
      const labels = this.extractAnchorLabels(alumnosHtml, 40);
      const targets = this.extractAnchorTargets(alumnosHtml, 40);
      // eslint-disable-next-line no-console
      console.log('[SIIAU][PROFILE] alumnos anchors sample:', labels);
      // eslint-disable-next-line no-console
      console.log('[SIIAU][PROFILE] alumnos anchor targets sample:', targets);
    }

    const academicAliases = [
      'historial academico',
      'historia academica',
      'calificaciones',
      'consulta de calificaciones',
      'avance curricular',
    ];

    const kardexAliases = [
      'kardex',
      'kardez',
      'historial academico',
      'historia academica',
      'record academico',
      'avance curricular',
    ];

    const boletaAliases = [
      'boleta',
      'boleta de calificaciones',
      'calificaciones',
      'consulta de calificaciones',
      'situacion academica',
      'evaluaciones',
    ];

    const hrefFragments = [
      'kard',
      'kdx',
      'bolet',
      'calif',
      'hist',
      'trayec',
      'certif',
      'acredit',
      'avance',
    ];

    let kardex: { url: string; html: string } | null = null;
    let boleta: { url: string; html: string } | null = null;
    const visitedUrls = new Set<string>();

    const scanPage = async (page: { url: string; html: string }) => {
      if (visitedUrls.has(page.url)) return;
      visitedUrls.add(page.url);

      kardex = kardex ?? await this.tryOpenByTextAny(page.url, page.html, kardexAliases, carreraPrefer)
                     ?? await this.tryOpenByHrefAny(page.url, page.html, kardexAliases, carreraPrefer)
                     ?? await this.tryOpenByHrefFragmentsAny(page.url, page.html, hrefFragments, carreraPrefer);

      boleta = boleta ?? await this.tryOpenByTextAny(page.url, page.html, boletaAliases, carreraPrefer)
                     ?? await this.tryOpenByHrefAny(page.url, page.html, boletaAliases, carreraPrefer)
                     ?? await this.tryOpenByHrefFragmentsAny(page.url, page.html, hrefFragments, carreraPrefer);
    };

    // 1. Escanear pagina base Alumnos
    await scanPage({ url: alumnosUrl, html: alumnosHtml });

    if (!kardex || !boleta) {
      // 2. Abrir Secciones principales
      const sectionPages = await this.openSectionCandidates(
        alumnosUrl,
        alumnosHtml,
        ['ACAD', 'REGISTRO', 'ALUMNOS'],
        carreraPrefer,
      );

      for (const sp of sectionPages) {
        if (kardex && boleta) break;
        await scanPage(sp);
      }

      // 3. Fallback: Escanear alias profundos
      if (!kardex || !boleta) {
        const pagesToExpand = [ { url: alumnosUrl, html: alumnosHtml }, ...sectionPages ];
        for (const page of pagesToExpand) {
          if (kardex && boleta) break;
          const discovered = await this.openMatchesByAnchorKeywords(
            page.url,
            page.html,
            academicAliases,
            carreraPrefer,
          );
          for (const dp of discovered) {
            if (kardex && boleta) break;
            await scanPage(dp);
          }
        }
      }
    }

    if (this.debugProfile) {
      // eslint-disable-next-line no-console
      console.log('[SIIAU][PROFILE] open results:', {
        kardex: Boolean(kardex),
        boleta: Boolean(boleta),
      });
    }

    if (!kardex && !boleta) {
      return null;
    }

    const castedKardex = kardex as { url: string; html: string } | null;
    const castedBoleta = boleta as { url: string; html: string } | null;

    const pages = [castedKardex?.html ?? '', castedBoleta?.html ?? ''];
    const average = this.extractAverageFromPages(...pages);
    const creditsEarned = this.extractLabeledNumber(pages, [
      'creditos adquiridos totales',
      'creditos adquiridos',
      'creditos aprobados',
      'creditos acumulados',
      'creditos obtenidos',
    ]);
    const creditsTotal = this.extractLabeledNumber(pages, [
      'creditos del plan',
      'total de creditos',
      'creditos requeridos',
      'creditos carrera',
    ]);
    const careerName = this.extractCareerName(pages);

    const completedClasses = this.extractClassesFromTables(
      castedKardex?.html ?? '',
      ['APROBAD', 'ACREDIT', 'ORDINARIO', 'EXTRAORDINARIO'],
    );
    const pendingClasses = this.extractPendingFromBoleta(castedBoleta?.html ?? '');

    return {
      source: 'kardex-boleta',
      careerName,
      average,
      creditsEarned,
      creditsTotal,
      completedClasses,
      pendingClasses,
    };
  }

  private async openSectionCandidates(
    baseUrl: string,
    html: string,
    labels: string[],
    carreraPrefer?: string,
  ): Promise<Array<{ url: string; html: string }>> {
    const pages: Array<{ url: string; html: string }> = [];
    const visited = new Set<string>();

    for (const label of labels) {
      try {
        const page = await this.openByText(baseUrl, html, label, carreraPrefer);
        if (!visited.has(page.url)) {
          visited.add(page.url);
          pages.push(page);

          if (this.debugProfile) {
            const labels = this.extractAnchorLabels(page.html, 60);
            const targets = this.extractAnchorTargets(page.html, 60);
            // eslint-disable-next-line no-console
            console.log('[SIIAU][PROFILE] section opened:', label, page.url);
            // eslint-disable-next-line no-console
            console.log('[SIIAU][PROFILE] section anchors sample:', labels);
            // eslint-disable-next-line no-console
            console.log('[SIIAU][PROFILE] section anchor targets sample:', targets);
          }
        }
      } catch (error) {
        if (this.debugProfile) {
          const message =
            error instanceof Error ? error.message : 'unknown section error';
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] section failed:', label, message);
        }
      }
    }

    return pages;
  }

  private extractAnchorLabels(html: string, limit = 30): string[] {
    const $ = loadHtml(html);
    return $('a')
      .toArray()
      .map((a) => textOf($(a)).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private normalizeLooseText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/�/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private normalizeConsonants(value: string): string {
    return this.normalizeLooseText(value).replace(/[aeiou]/g, '');
  }

  private isAnchorKeywordMatch(anchorText: string, keywords: string[]): boolean {
    const text = this.normalizeLooseText(anchorText);
    const textConsonants = this.normalizeConsonants(anchorText);
    if (!text) return false;
    return keywords.some((k) => {
      const key = this.normalizeLooseText(k);
      if (key.length === 0) return false;
      if (text.includes(key)) return true;

      const keyConsonants = this.normalizeConsonants(k);
      return keyConsonants.length > 0 && textConsonants.includes(keyConsonants);
    });
  }

  private extractAnchorTargets(html: string, limit = 30): string[] {
    const $ = loadHtml(html);
    return $('a')
      .toArray()
      .map((a) => {
        const text = textOf($(a)).replace(/\s+/g, ' ').trim();
        const href = ($(a).attr('href') ?? '').trim();
        const onclick = ($(a).attr('onclick') ?? '').trim();
        return `${text} | href=${href} | onclick=${onclick}`;
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  private async openMatchesByAnchorKeywords(
    baseUrl: string,
    html: string,
    keywords: string[],
    carreraPrefer?: string,
  ): Promise<Array<{ url: string; html: string }>> {
    const $ = loadHtml(html);
    const out: Array<{ url: string; html: string }> = [];
    const visited = new Set<string>();

    for (const a of $('a').toArray()) {
      const text = textOf($(a));
      if (!this.isAnchorKeywordMatch(text, keywords)) continue;

      try {
        const page = await this.openAnchorElement(baseUrl, html, a, carreraPrefer);
        if (visited.has(page.url)) continue;
        visited.add(page.url);
        out.push(page);

        if (this.debugProfile) {
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] discovered keyword page:', text.trim(), page.url);
        }
      } catch (error) {
        if (this.debugProfile) {
          const message = error instanceof Error ? error.message : 'unknown keyword open error';
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] keyword open failed:', text.trim(), message);
        }
      }
    }

    return out;
  }

  private async tryOpenByHrefAny(
    baseUrl: string,
    html: string,
    keywords: string[],
    carreraPrefer?: string,
  ): Promise<{ url: string; html: string } | null> {
    const $ = loadHtml(html);

    for (const a of $('a').toArray()) {
      const href = ($(a).attr('href') ?? '').trim();
      const onclick = ($(a).attr('onclick') ?? '').trim();
      const combined = this.normalizeLooseText(`${href} ${onclick}`);

      if (
        !keywords.some((k) => {
          const key = this.normalizeLooseText(k);
          if (key.length > 0 && combined.includes(key)) return true;

          const keyConsonants = this.normalizeConsonants(k);
          const combinedConsonants = this.normalizeConsonants(combined);
          return (
            keyConsonants.length > 0 &&
            combinedConsonants.includes(keyConsonants)
          );
        })
      ) {
        continue;
      }

      try {
        const page = await this.openAnchorElement(baseUrl, html, a, carreraPrefer);
        if (this.debugProfile) {
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] href match opened:', { href, onclick, url: page.url });
        }
        return page;
      } catch (error) {
        if (this.debugProfile) {
          const message = error instanceof Error ? error.message : 'unknown href open error';
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] href match failed:', { href, onclick, message });
        }
      }
    }

    return null;
  }

  private async tryOpenByHrefFragmentsAny(
    baseUrl: string,
    html: string,
    fragments: string[],
    carreraPrefer?: string,
  ): Promise<{ url: string; html: string } | null> {
    const $ = loadHtml(html);

    for (const a of $('a').toArray()) {
      const href = ($(a).attr('href') ?? '').trim();
      const onclick = ($(a).attr('onclick') ?? '').trim();
      const combined = this.normalizeLooseText(`${href} ${onclick}`);
      if (!combined) continue;

      const hit = fragments.find((fragment) => {
        const token = this.normalizeLooseText(fragment);
        return token.length > 0 && combined.includes(token);
      });
      if (!hit) continue;

      try {
        const page = await this.openAnchorElement(baseUrl, html, a, carreraPrefer);
        if (this.debugProfile) {
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] href-fragment match opened:', {
            fragment: hit,
            href,
            onclick,
            url: page.url,
          });
        }
        return page;
      } catch (error) {
        if (this.debugProfile) {
          const message = error instanceof Error ? error.message : 'unknown href fragment open error';
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] href-fragment match failed:', {
            fragment: hit,
            href,
            onclick,
            message,
          });
        }
      }
    }

    return null;
  }

  private async tryOpenByTextAny(
    baseUrl: string,
    html: string,
    labels: string[],
    carreraPrefer?: string,
  ): Promise<{ url: string; html: string } | null> {
    for (const label of labels) {
      try {
        if (this.debugProfile) {
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] trying label:', label);
        }
        return await this.openByText(baseUrl, html, label, carreraPrefer);
      } catch (error) {
        if (this.debugProfile) {
          const message =
            error instanceof Error ? error.message : 'unknown profile link error';
          // eslint-disable-next-line no-console
          console.log('[SIIAU][PROFILE] label failed:', label, message);
        }
        // try next label variant
      }
    }
    return null;
  }

  private extractLabeledNumber(pages: string[], labels: string[]): number | null {
    for (const html of pages) {
      const text = textOf(loadHtml(html).root()).replace(/\s+/g, ' ').toLowerCase();
      for (const label of labels) {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = text.match(new RegExp(`${escaped}[^0-9]{0,15}(\\d{1,4}(?:[\\.,]\\d{1,2})?)`, 'i'));
        if (!m?.[1]) continue;
        const value = Number(m[1].replace(',', '.'));
        if (Number.isFinite(value)) {
          return Number(value.toFixed(2));
        }
      }
    }
    return null;
  }

  private extractCareerName(pages: string[]): string | null {
    for (const html of pages) {
      const text = textOf(loadHtml(html).root()).replace(/\s+/g, ' ');
      const m = text.match(/carrera\s*[:\-]\s*([A-ZÁÉÍÓÚÑ0-9\-\s]{6,80})/i);
      if (m?.[1]) {
        return m[1].trim();
      }
    }
    return null;
  }

  private getDirectTableRows(table: { children: (selector: string) => { children: (childSelector: string) => { toArray: () => unknown[] }; toArray: () => unknown[] } }): unknown[] {
    const bodyRows = table.children('tbody').children('tr').toArray();
    if (bodyRows.length > 0) return bodyRows;
    return table.children('tr').toArray();
  }

  private getRowCells(
    $: ReturnType<typeof loadHtml>,
    tr: unknown,
    tagName: 'td' | 'th',
  ): string[] {
    return $(tr as never)
      .children(tagName)
      .toArray()
      .map((cell) => textOf($(cell)).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  private findHeaderIndex(headers: string[], aliases: string[]): number {
    return headers.findIndex((header) => {
      const normalizedHeader = this.normalizeLooseText(header);
      const normalizedHeaderConsonants = this.normalizeConsonants(header);

      return aliases.some((alias) => {
        const normalizedAlias = this.normalizeLooseText(alias);
        if (normalizedAlias && normalizedHeader.includes(normalizedAlias)) {
          return true;
        }

        const aliasConsonants = this.normalizeConsonants(alias);
        return (
          aliasConsonants.length > 0 &&
          normalizedHeaderConsonants.includes(aliasConsonants)
        );
      });
    });
  }

  private extractGradeFromIndexedColumn(
    cols: string[],
    gradeIndex: number,
  ): number | null {
    if (gradeIndex < 0 || gradeIndex >= cols.length) return null;

    const match = cols[gradeIndex]?.match(/\b(100(?:[\.,]0+)?|\d{1,2}(?:[\.,]\d{1,2})?)\b/);
    if (!match?.[1]) return null;

    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    return Number(value.toFixed(2));
  }

  private extractFallbackGrade(cols: string[]): number | null {
    const numericTokens = cols
      .flatMap((cell) =>
        Array.from(
          cell.matchAll(/\b(100(?:[\.,]0+)?|\d{1,2}(?:[\.,]\d{1,2})?)\b/g),
        ).map((match) => Number((match[1] ?? '').replace(',', '.'))),
      )
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

    if (numericTokens.length === 0) return null;

    const approvedGrade = numericTokens.find((value) => value >= 60);
    const grade = approvedGrade ?? numericTokens[numericTokens.length - 1] ?? null;
    return grade == null ? null : Number(grade.toFixed(2));
  }

  private pickClassId(cols: string[], rowIndex: number): string {
    return (
      cols.find((cell) => /\b[A-Z]{1,}\d{2,}[A-Z0-9-]*\b/i.test(cell)) ??
      cols.find((cell) => /\b\d{4,}\b/.test(cell)) ??
      `row-${rowIndex}`
    );
  }

  private pickClassName(cols: string[]): string {
    return (
      cols.find((cell) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(cell) && cell.length > 8) ??
      cols[0] ??
      'Materia sin nombre'
    );
  }

  private extractClassesFromTables(
    html: string,
    statusHints: string[],
  ): Array<{ id: string; name: string; grade?: number | null; description?: string | null }> {
    if (!html) return [];

    const $ = loadHtml(html);
    const out: Array<{ id: string; name: string; grade?: number | null; description?: string | null }> = [];

    $('table').each((_tableIndex, tableElement) => {
      const table = $(tableElement);
      const rows = this.getDirectTableRows(table);
      if (rows.length === 0) return;

      let headers: string[] = [];

      rows.forEach((tr, rowIndex) => {
        const headerCells = this.getRowCells($, tr, 'th');
        if (headerCells.length > 0) {
          headers = headerCells;
          return;
        }

        const cols = this.getRowCells($, tr, 'td');
        if (cols.length < 2) return;

        if (
          headers.length === 0 &&
          cols.some((cell) =>
            ['clave', 'materia', 'calificacion', 'calif', 'estado', 'situacion'].some(
              (label) => this.normalizeLooseText(cell).includes(label),
            ),
          )
        ) {
          headers = cols;
          return;
        }

        const rowTextUpper = cols.join(' ').toUpperCase();
        if (!statusHints.some((hint) => rowTextUpper.includes(hint))) return;

        const statusIndex = this.findHeaderIndex(headers, ['estado', 'situacion', 'resultado']);
        const statusLabel =
          (statusIndex >= 0 && cols[statusIndex]) ||
          cols.find((cell) => statusHints.some((hint) => cell.toUpperCase().includes(hint))) ||
          statusHints.find((hint) => rowTextUpper.includes(hint)) ||
          'SIN ESTADO';

        const idIndex = this.findHeaderIndex(headers, ['clave', 'codigo', 'materia clave', 'unidad de aprendizaje']);
        const nameIndex = this.findHeaderIndex(headers, ['materia', 'asignatura', 'nombre', 'curso']);
        const gradeIndex = this.findHeaderIndex(headers, ['calificacion', 'calif', 'nota', 'promedio']);

        const id =
          (idIndex >= 0 && cols[idIndex]?.trim()) || this.pickClassId(cols, rowIndex);
        const name =
          (nameIndex >= 0 && cols[nameIndex]?.trim()) || this.pickClassName(cols);
        const gradeCandidate =
          this.extractGradeFromIndexedColumn(cols, gradeIndex) ??
          this.extractFallbackGrade(cols);

        out.push({
          id,
          name,
          grade: gradeCandidate,
          description: `Materia acreditada en Kardex. Estado: ${statusLabel}.`,
        });
      });
    });

    const uniq = new Map<
      string,
      { id: string; name: string; grade?: number | null; description?: string | null }
    >();
    for (const item of out) {
      if (!uniq.has(item.id)) uniq.set(item.id, item);
    }

    return Array.from(uniq.values()).slice(0, 300);
  }

  private extractPendingFromBoleta(
    html: string,
  ): Array<{ id: string; name: string; xpReward: number }> {
    if (!html) return [];

    const $ = loadHtml(html);
    const out: Array<{ id: string; name: string; xpReward: number }> = [];

    $('tr').each((index, tr) => {
      const cols = $(tr)
        .find('td')
        .toArray()
        .map((td) => textOf($(td)).replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      if (cols.length < 2) return;

      const id = cols.find((c) => /\b\d{4,}\b/.test(c)) ?? `boleta-${index}`;
      const name =
        cols.find((c) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(c) && c.length > 8) ?? cols[0];
      const creditRaw = cols.find((c) => /^\d{1,2}(?:[\.,]\d{1,2})?$/.test(c)) ?? '0';
      const xpReward = Number(creditRaw.replace(',', '.')) || 0;

      out.push({ id, name, xpReward });
    });

    const uniq = new Map<string, { id: string; name: string; xpReward: number }>();
    for (const item of out) {
      if (!uniq.has(item.id)) uniq.set(item.id, item);
    }

    return Array.from(uniq.values()).slice(0, 300);
  }

  private async loginMw(codigo: string, nip: string, flowId = 'login'): Promise<string> {
    this.logFlow(flowId, 'Login MW inicio', { codigo: this.maskCode(codigo) });
    await this.sleepJitter();
    const rGet = await this.http.get(this.URL_LOGIN, {
      headers: { Referer: this.URL_LOGIN },
    });
    const htmlGet = rGet.data as string;

    const viewState = extractViewState(htmlGet);
    if (!viewState)
      throw new Error('No se pudo obtener javax.faces.ViewState en login.');

    const $ = loadHtml(htmlGet);
    let btnName = '';
    $('button')
      .toArray()
      .forEach((b) => {
        const t = textOf($(b));
        if (t.includes('Aceptar')) btnName = ($(b).attr('name') ?? '').trim();
      });

    const payload: Record<string, string> = {
      'javax.faces.ViewState': viewState,
      loginForm: 'loginForm',
      'loginForm:codigo': codigo,
      'loginForm:password': nip,
    };
    if (btnName) payload[btnName] = 'Aceptar';

    await this.sleepJitter();
    const rPost = await this.http.post(
      this.URL_LOGIN,
      new URLSearchParams(payload),
      {
        maxRedirects: 0, // No seguir el redirect automáticamente; el redirect
        // interno de axios no pasa por los interceptores, por lo que el
        // JSESSIONID no se enviaría al destino y SIIAU devolvería la página de
        // login de nuevo. Se sigue manualmente más abajo.
        headers: {
          Referer: this.URL_LOGIN,
          Origin: 'https://mw.siiau.udg.mx',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    // Login exitoso → SIIAU responde 302 hacia el dashboard
    if (rPost.status === 302) {
      const loc = (rPost.headers['location'] as string | undefined) ?? '';
      if (!loc || /login\.xhtml/i.test(loc)) {
        throw new Error('Credenciales incorrectas (login no avanzó).');
      }
      const nextUrl = urlJoin(this.URL_LOGIN, loc);
      await this.sleepJitter();
      const rDash = await this.http.get(nextUrl, {
        headers: { Referer: this.URL_LOGIN },
      });
      this.logFlow(flowId, 'Login MW OK por redirect', {
        status: rPost.status,
        nextUrl,
      });
      return rDash.data as string;
    }

    const htmlPost = rPost.data as string;
    if ((htmlPost ?? '').includes('name="loginForm:password"')) {
      throw new Error('Credenciales incorrectas (login no avanzó).');
    }
    this.logFlow(flowId, 'Login MW OK por respuesta HTML', {
      status: rPost.status,
    });
    return htmlPost;
  }

  private async jumpToEscolar(
    dashboardHtml: string,
  ): Promise<{ url: string; html: string }> {
    const $ = loadHtml(dashboardHtml);
    const form = $('form#sistemasForm');
    if (!form.length) throw new Error('No se halló dashboard (sistemasForm).');

    const action = (form.attr('action') ?? '').trim();
    if (!action) throw new Error('No se encontró action del sistemasForm.');

    const viewState = extractViewState(dashboardHtml);
    if (!viewState) throw new Error('No se encontró ViewState en dashboard.');

    const enlace = $('a')
      .toArray()
      .find(
        (a) =>
          ($(a).attr('onclick') ?? '').includes('mojarra.jsfcljs') &&
          ($(a).attr('onclick') ?? '').includes('sistemasForm'),
      );
    if (!enlace)
      throw new Error('No se encontró botón a Escolar (mojarra.jsfcljs).');

    const onclick = ($(enlace).attr('onclick') ?? '').trim();
    const pairs = extractMojarraPairs(onclick);

    const payload: Record<string, string> = {
      'javax.faces.ViewState': viewState,
      sistemasForm: 'sistemasForm',
      ...pairs,
    };

    const urlDestino = urlJoin(this.URL_LOGIN, action);

    await this.sleepJitter();
    const rPuente = await this.http.post(
      urlDestino,
      new URLSearchParams(payload),
      {
        maxRedirects: 0,
        headers: {
          Referer: this.URL_LOGIN,
          Origin: 'https://mw.siiau.udg.mx',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: (s) => (s >= 200 && s < 400) || s === 302,
      },
    );

    const loc = (rPuente.headers['location'] as string | undefined) ?? '';
    const nextUrl = loc ? urlJoin(urlDestino, loc) : this.URL_EMICORE;

    await this.sleepJitter();
    const rEntry = await this.http.get(nextUrl, {
      headers: { Referer: this.URL_LOGIN },
    });
    return { url: nextUrl, html: rEntry.data as string };
  }

  private async openMenuSistemaAndPidm(
    entryUrl: string,
    entryHtml: string,
  ): Promise<{ pidm: string; menuHtml: string; menuUrl: string }> {
    const frames = parseFrames(entryHtml).map((f) => ({
      name: f.name,
      src: urlJoin(entryUrl, f.src),
    }));
    const mainUrl = frames.find((f) => f.name === 'mainFrame')?.src;
    const topUrl = frames.find((f) => f.name === 'topFrame')?.src;

    if (topUrl) {
      await this.sleepJitter();
      await this.http.get(topUrl, { headers: { Referer: entryUrl } });
    }
    if (!mainUrl) throw new Error('No se encontró mainFrame.');

    await this.sleepJitter();
    const rMain = await this.http.get(mainUrl, {
      headers: { Referer: entryUrl },
    });
    const mainHtml = rMain.data as string;

    const fInicio = findFormByName(mainHtml, 'fInicio');
    if (!fInicio || fInicio.method !== 'POST')
      throw new Error('No se encontró fInicio POST.');

    const fInicioUrl = urlJoin(mainUrl, fInicio.action);

    await this.sleepJitter();
    const rVal = await this.http.post(
      fInicioUrl,
      new URLSearchParams(fInicio.inputs),
      {
        headers: {
          Referer: mainUrl,
          Origin: this.BASE_ESCOLAR,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const valHtml = rVal.data as string;

    const mainPage = findFormByName(valHtml, 'mainPage');
    if (!mainPage) throw new Error('No se encontró mainPage.');

    const pidm = (mainPage.inputs['p_pidm_n'] ?? '').trim();
    if (!pidm) throw new Error('No se pudo extraer PIDM.');

    const baseForMainPage = this.getFinalUrl(rVal) ?? fInicioUrl;
    const mainPageUrl = urlJoin(baseForMainPage, mainPage.action);

    await this.sleepJitter();
    const rFm = await this.http.post(
      mainPageUrl,
      new URLSearchParams(mainPage.inputs),
      {
        headers: {
          Referer: fInicioUrl,
          Origin: this.BASE_ESCOLAR,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const fmHtml = rFm.data as string;
    const frames2 = parseFrames(fmHtml).map((f) => ({
      name: f.name,
      src: urlJoin(mainPageUrl, f.src),
    }));

    const menuUrl = frames2.find(
      (f) =>
        f.name === 'Menu' ||
        f.src.toLowerCase().includes('gupmenug.menu_sistema'),
    )?.src;
    if (!menuUrl) throw new Error('No se encontró frame Menu (menu_sistema).');

    await this.sleepJitter();
    const rMenu = await this.http.get(menuUrl, {
      headers: { Referer: mainPageUrl },
    });
    return { pidm, menuHtml: rMenu.data as string, menuUrl };
  }

  private async goToAlumnosUni(
    menuUrl: string,
    menuHtml: string,
  ): Promise<{ url: string; html: string }> {
    const $ = loadHtml(menuHtml);
    const link = $('a')
      .toArray()
      .map((a) => $(a).attr('href') ?? '')
      .find(
        (href) =>
          /(?:\?|&)p_sistema_c=ALUMNOS(?:&|$)/.test(href) &&
          !href.toUpperCase().includes('SEMS'),
      );
    if (!link)
      throw new Error('No encontré módulo ALUMNOS (UNI) en menu_sistema.');

    const target = urlJoin(menuUrl, link);

    await this.sleepJitter();
    const r = await this.http.get(target, { headers: { Referer: menuUrl } });
    const finalUrl = this.getFinalUrl(r) ?? target;
    return { url: finalUrl, html: r.data as string };
  }

  private setSelectedCarreraFromPage(html: string, prefer?: string) {
    const $ = loadHtml(html);
    const sel = $("select[name='p_carrera'], select#carreraID").first();
    if (!sel.length) {
      return {
        carreraValue: null as string | null,
        majrp: null as string | null,
        ciclo: null as string | null,
      };
    }

    const options = sel
      .find('option')
      .toArray()
      .map((o) => ({
        value: ($(o).attr('value') ?? '').trim(),
        selected: $(o).is('[selected]'),
      }));

    let chosen = '';
    if (prefer) {
      const hit = options.find((o) => o.value === prefer);
      if (hit) chosen = hit.value;
    }
    if (!chosen) {
      const inni = options.find((o) => o.value.toUpperCase().includes('INNI'));
      if (inni) chosen = inni.value;
    }
    if (!chosen) {
      const selOpt = options.find((o) => o.selected);
      if (selOpt) chosen = selOpt.value;
    }
    if (!chosen) chosen = options[0]?.value ?? '';

    if (!chosen) return { carreraValue: null, majrp: null, ciclo: null };
    if (chosen.includes('-')) {
      const [majrp, ciclo] = chosen.split('-', 2);
      return { carreraValue: chosen, majrp, ciclo };
    }
    return { carreraValue: chosen, majrp: chosen, ciclo: null };
  }

  private async openByText(
    baseUrl: string,
    html: string,
    label: string,
    carreraPrefer?: string,
  ): Promise<{ url: string; html: string }> {
    const $ = loadHtml(html);

    let aEl: unknown = null;
    for (const a of $('a').toArray()) {
      const t = this.normalizeLooseText(textOf($(a)));
      if (t === this.normalizeLooseText(label)) {
        aEl = a;
        break;
      }
    }
    if (!aEl) {
      for (const a of $('a').toArray()) {
        const t = this.normalizeLooseText(textOf($(a)));
        if (t.includes(this.normalizeLooseText(label))) {
          aEl = a;
          break;
        }
      }
    }
    if (!aEl) throw new Error(`No encontré link '${label}' en la página.`);

    return this.openAnchorElement(baseUrl, html, aEl, carreraPrefer);
  }

  private async openAnchorElement(
    baseUrl: string,
    html: string,
    anchorElement: unknown,
    carreraPrefer?: string,
  ): Promise<{ url: string; html: string }> {
    const selected = this.setSelectedCarreraFromPage(html, carreraPrefer);
    const majrp = selected.majrp;
    const $ = loadHtml(html);

    const a = $(anchorElement as Parameters<typeof $>[0]);
    const href = (a.attr('href') ?? '').trim();
    const onclick = (a.attr('onclick') ?? '').trim();

    let target = '';
    if (href && !href.toLowerCase().startsWith('javascript:')) target = href;
    else if (href.toLowerCase().startsWith('javascript:'))
      target = urlFromJs(href);
    if (!target) target = urlFromJs(onclick);

    if (!target) throw new Error('No pude resolver URL para el link seleccionado.');

    if (shouldApplyRevisaCarrera(onclick, target)) {
      target = patchMajrp(target, majrp);
    }

    const abs = urlJoin(baseUrl, target);

    await this.sleepJitter();
    const r = await this.http.get(abs, { headers: { Referer: baseUrl } });
    const finalUrl = this.getFinalUrl(r) ?? abs;
    return { url: finalUrl, html: r.data as string };
  }

  private async fetchOferta(
    pidm: string,
    majrp: string,
    cicloDesired: string,
    referer: string,
  ): Promise<{ url: string; html: string }> {
    const formUrl = `${this.WAL}/sgpofer.secciones?pidmp=${pidm}&majrp=${majrp}`;

    await this.sleepJitter();
    const rForm = await this.http.get(formUrl, {
      headers: { Referer: referer },
    });
    const formHtml = rForm.data as string;

    const $ = loadHtml(formHtml);
    const formTag = $("form[name='frm_consulta_oferta']").first().length
      ? $("form[name='frm_consulta_oferta']").first()
      : $('form').first();

    const action = (formTag.attr('action') ?? 'sspseca.consulta_oferta').trim();
    const base = this.getFinalUrl(rForm) ?? formUrl;
    const postUrl = urlJoin(base, action);

    const cicloValue = resolveCicloFromSelect(formHtml, cicloDesired);

    const payload: Record<string, string> = {
      ciclop: cicloValue,
      cup: '',
      majrp,
      majrdescp: '',
      crsep: '',
      materiap: '',
      horaip: '',
      horafp: '',
      edifp: '',
      aulap: '',
      dispp: '',
      ordenp: '0',
      mostrarp: '500',
    };

    await this.sleepJitter();
    const rRes = await this.http.post(postUrl, new URLSearchParams(payload), {
      headers: {
        Referer: base,
        Origin: this.BASE_ESCOLAR,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const finalUrl = this.getFinalUrl(rRes) ?? postUrl;
    return { url: finalUrl, html: rRes.data as string };
  }
}
