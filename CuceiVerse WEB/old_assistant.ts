import { Injectable } from '@nestjs/common';
import axios from 'axios';

import { PrismaService } from '../prisma/prisma.service';
import { PathfindingService } from '../mapa/pathfinding.service';
import { SiiauSessionCacheService } from '../siiau/siiau-session-cache.service';
import type {
  AssistantChatResponse,
  AssistantChatDto,
} from './dto/assistant-chat.dto';

type AssistantUser = {
  id: string;
  siiauCode: string;
};

type SessionEntry = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot: {
    profile?: {
      careerName?: string | null;
      average?: number | null;
      completedClasses?: Array<{ id: string; name: string; grade?: number | null }>;
    };
    courses: Array<{
      nrc: string;
      materia: string;
      clave: string;
      creditos?: number | null;
      sessions?: Array<{
        hora?: string | null;
        dias?: string | null;
        aula?: string | null;
        profesor?: string | null;
        edif?: string | null;
      }>;
    }>;
  } | null;
  error: string | null;
};

type Poi = {
  id: string;
  nombre: string;
  nearestPathNodeId: string | null;
};

const NAVIGATION_STOPWORDS = new Set([
  'como',
  'llego',
  'donde',
  'esta',
  'esta',
  'ruta',
  'llevame',
  'llevame',
  'guiame',
  'camino',
  'quiero',
  'ir',
  'al',
  'a',
  'la',
  'el',
  'los',
  'las',
  'de',
  'del',
  'por',
  'favor',
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStartTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const hit = raw.match(/(\d{3,4})\s*-\s*\d{3,4}/);
  if (!hit?.[1]) return null;
  const padded = hit[1].padStart(4, '0');
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function dayTokenForDate(date: Date): string {
  const day = date.getDay();
  if (day === 0) return 'D';
  if (day === 1) return 'L';
  if (day === 2) return 'M';
  if (day === 3) return 'I';
  if (day === 4) return 'J';
  if (day === 5) return 'V';
  return 'S';
}

function hasDay(dias: string | null | undefined, token: string): boolean {
  if (!dias) return false;
  return dias.toUpperCase().replace(/\s+/g, '').includes(token);
}

function navigationTokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !NAVIGATION_STOPWORDS.has(token));
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pathfindingService: PathfindingService,
    private readonly siiauSessionCacheService: SiiauSessionCacheService,
  ) {}

  async chat(user: AssistantUser, dto: AssistantChatDto): Promise<AssistantChatResponse> {
    const aiResponse = await this.tryAiAgent(user, dto);
    if (aiResponse) return aiResponse;

    const message = dto.message.trim();
    const normalized = normalizeText(message);
    const baseContext = {
      lastDestinationPoiId: dto.context?.lastDestinationPoiId,
      lastDestinationLabel: dto.context?.lastDestinationLabel,
    };

    if (this.isNavigationIntent(normalized)) {
      return this.handleNavigationIntent(normalized, baseContext);
    }

    if (this.isAcademicIntent(normalized)) {
      return this.handleAcademicIntent(user.id, normalized, baseContext);
    }

    if (this.isPlatformIntent(normalized)) {
      return this.handlePlatformIntent(normalized, baseContext);
    }

    return {
      intent: 'general',
      reply:
        'Puedo ayudarte con rutas del campus, horario, promedio y dudas de CUCEIverse. Prueba con: "¿Qué clases tengo hoy?" o "¿Cómo llego al edificio A?".',
      suggestions: [
        '¿Qué clases tengo hoy?',
        '¿Cuál es mi promedio?',
        '¿Cómo llego al laboratorio de redes?',
      ],
      context: baseContext,
    };
  }

  private async tryAiAgent(
    user: AssistantUser,
    dto: AssistantChatDto,
  ): Promise<AssistantChatResponse | null> {
    const endpoint = process.env.ASSISTANT_AI_URL?.trim();
    if (!endpoint) return null;

    try {
      const payload = {
        user_id: user.id,
        siiau_code: user.siiauCode,
        message: dto.message,
        history: dto.history ?? [],
        context: dto.context ?? {},
      };

      const response = await axios.post(`${endpoint}/assistant/chat`, payload, {
        timeout: Number(process.env.ASSISTANT_AI_TIMEOUT_MS ?? 4000),
      });

      const data = response.data as AssistantChatResponse | undefined;
      if (!data?.reply || !data.intent) return null;
      return data;
    } catch {
      return null;
    }
  }

  private isNavigationIntent(message: string): boolean {
    return /(como llego|donde esta|ruta|llevame|llevame ahi|guiame|camino)/.test(message);
  }

  private isAcademicIntent(message: string): boolean {
    return /(clases|horario|promedio|kardex|materias|salon|aula|hoy|manana|siguiente clase)/.test(
      message,
    );
  }

  private isPlatformIntent(message: string): boolean {
    return /(avatar|grupo de estudio|tramite|trámites|perfil|mapa|oferta|cuceiverse|siiau)/.test(
      message,
    );
  }

  private async handleNavigationIntent(
    normalizedMessage: string,
    baseContext: { lastDestinationPoiId?: string; lastDestinationLabel?: string },
  ): Promise<AssistantChatResponse> {
    const pois = await this.prisma.puntoInteres.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, nearestPathNodeId: true },
      take: 250,
      orderBy: [{ prioridadVisual: 'desc' }, { nombre: 'asc' }],
    });

    const resolved = this.resolvePoi(normalizedMessage, pois, baseContext);
    if (!resolved) {
      const suggestions = this.getNavigationFallbackSuggestions(pois);
      return {
        intent: 'navigation',
        reply:
          'No encontré ese destino en el mapa actual. Prueba con un punto registrado del campus y te guío de inmediato.',
        suggestions,
        context: baseContext,
      };
    }

    let routeHint = '';
    if (baseContext.lastDestinationPoiId && resolved.id !== baseContext.lastDestinationPoiId) {
      try {
        const route = await this.pathfindingService.calcularRuta(
          baseContext.lastDestinationPoiId,
          resolved.id,
        );
        routeHint = ` Distancia estimada desde el último destino: ${Math.round(route.distanciaTotal)} unidades.`;
      } catch {
        // optional hint
      }
    }

    return {
      intent: 'navigation',
      reply: `Te guío a ${resolved.nombre}. Voy a preparar la ruta en el mapa.${routeHint}`,
      suggestions: [
        '¿Cuál es la ruta más corta?',
        '¿Qué hay cerca de ahí?',
        'Llévame al siguiente edificio',
      ],
      context: {
        lastDestinationPoiId: resolved.id,
        lastDestinationLabel: resolved.nombre,
      },
      action: {
        type: 'highlight-route',
        destinationPoiId: resolved.id,
        destinationLabel: resolved.nombre,
      },
    };
  }

  private resolvePoi(
    message: string,
    pois: Poi[],
    context: { lastDestinationPoiId?: string; lastDestinationLabel?: string },
  ): Poi | null {
    if (/(ahi|alli|ese edificio|ese lugar|muestrame la ruta)/.test(message)) {
      if (context.lastDestinationPoiId) {
        const byContext = pois.find((poi) => poi.id === context.lastDestinationPoiId);
        if (byContext) return byContext;
      }
      if (context.lastDestinationLabel) {
        const label = normalizeText(context.lastDestinationLabel);
        const byLabel = pois.find((poi) => normalizeText(poi.nombre) === label);
        if (byLabel) return byLabel;
      }
    }

    if (/(biblioteca|library)/.test(message)) {
      const cidInfo = pois.find((poi) => normalizeText(poi.nombre).includes('informacion cid'));
      if (cidInfo) return cidInfo;
    }

    const inputTokens = navigationTokens(message);
    if (inputTokens.length === 0) return null;

    const scored = pois
      .map((poi) => {
        const normalizedName = normalizeText(poi.nombre);
        if (!normalizedName) return { poi, score: 0 };
        if (message.includes(normalizedName)) return { poi, score: normalizedName.length + 100 };

        const aliases = this.poiAliases(normalizedName);
        if (aliases.some((alias) => alias.length >= 4 && message.includes(alias))) {
          return { poi, score: 85 };
        }

        const tokens = navigationTokens(normalizedName);
        const overlap = tokens.reduce(
          (acc, token) => (inputTokens.includes(token) ? acc + token.length : acc),
          0,
        );
        const prefixBonus = tokens.some((token) => inputTokens.some((input) => input.startsWith(token) || token.startsWith(input)))
          ? 8
          : 0;
        const score = overlap + prefixBonus;
        return { poi, score };
      })
      .sort((left, right) => right.score - left.score);

    if (!scored[0] || scored[0].score < 4) return null;
    return scored[0].poi;
  }

  private poiAliases(normalizedName: string): string[] {
    const aliases = new Set<string>();
    aliases.add(normalizedName);

    if (normalizedName.includes('servicio medico')) {
      aliases.add('medico');
      aliases.add('enfermeria');
    }
    if (normalizedName.includes('cafeteria')) {
      aliases.add('cafe');
      aliases.add('comida');
      aliases.add('cafeteria cta');
    }
    if (normalizedName.includes('control escolar')) {
      aliases.add('escolar');
      aliases.add('control');
    }
    if (normalizedName.includes('registro escolar')) {
      aliases.add('registro');
      aliases.add('ventanilla');
    }
    if (normalizedName.includes('modulo de informacion cid')) {
      aliases.add('cid');
      aliases.add('informacion');
      aliases.add('biblioteca');
    }
    if (normalizedName.includes('auditorio')) {
      aliases.add('auditorio');
      if (normalizedName.includes('matute')) aliases.add('matute');
      if (normalizedName.includes('nikolai')) aliases.add('nikolai');
      if (normalizedName.includes('antonio')) aliases.add('antonio rodriguez');
    }

    return [...aliases];
  }

  private getNavigationFallbackSuggestions(pois: Poi[]): string[] {
    const ranked = pois
      .slice(0, 6)
      .map((poi) => `Llévame a ${poi.nombre}`);

    return ranked.length > 0
      ? ranked.slice(0, 3)
      : ['Llévame a Control Escolar', 'Llévame a CTA Cafetería', 'Llévame al Servicio Médico'];
  }

  private async handleAcademicIntent(
    userId: string,
    normalizedMessage: string,
    baseContext: { lastDestinationPoiId?: string; lastDestinationLabel?: string },
  ): Promise<AssistantChatResponse> {
    const session = (await this.siiauSessionCacheService.get(userId)) as SessionEntry;
    if (session.status !== 'ready' || !session.snapshot) {
      return {
        intent: 'academic',
        reply:
          'Aún no tengo tu snapshot académico listo. Abre Oferta Académica para terminar la sincronización con SIIAU.',
        suggestions: ['¿Qué clases tengo hoy?', '¿Cuál es mi promedio?', '¿Qué materias curso este semestre?'],
        context: baseContext,
      };
    }

    const snapshot = session.snapshot;

    if (/(promedio|average)/.test(normalizedMessage)) {
      const average = snapshot.profile?.average;
      return {
        intent: 'academic',
        reply:
          average == null
            ? 'Tu promedio no está disponible todavía en el snapshot actual.'
            : `Tu promedio actual en SIIAU es ${Number(average).toFixed(2)}.`,
        suggestions: ['¿Qué clases tengo hoy?', '¿Qué materias estoy cursando?'],
        context: baseContext,
      };
    }

    if (/(materias|cursando|inscritas|este semestre)/.test(normalizedMessage)) {
      const names = snapshot.courses.slice(0, 8).map((course) => course.materia);
      const extra = snapshot.courses.length > 8 ? ` y ${snapshot.courses.length - 8} más` : '';
      return {
        intent: 'academic',
        reply:
          snapshot.courses.length === 0
            ? 'No encontré materias inscritas en tu snapshot actual.'
            : `Estás cursando: ${names.join(', ')}${extra}.`,
        suggestions: ['¿Qué clases tengo hoy?', '¿Cuál es mi siguiente clase?'],
        context: baseContext,
      };
    }

    if (/(hoy|siguiente clase|siguiente materia)/.test(normalizedMessage)) {
      const today = new Date();
      const token = dayTokenForDate(today);
      const nowMinutes = today.getHours() * 60 + today.getMinutes();

      const todaySessions = snapshot.courses.flatMap((course) =>
        (course.sessions ?? [])
          .filter((session) => hasDay(session.dias, token))
          .map((session) => ({ course, session, start: parseStartTime(session.hora) })),
      );

      todaySessions.sort((left, right) => (left.start ?? 9999) - (right.start ?? 9999));
      const nextClass = todaySessions.find((entry) => (entry.start ?? 9999) >= nowMinutes);

      if (nextClass) {
        const room = nextClass.session.aula || 'Aula por definir';
        return {
          intent: 'academic',
          reply: `Tu siguiente clase hoy es ${nextClass.course.materia} a las ${nextClass.session.hora ?? 'hora por definir'} en ${room}.`,
          suggestions: ['¿Qué clases tengo hoy?', '¿Cuál es mi promedio?'],
          context: baseContext,
        };
      }

      if (todaySessions.length > 0) {
        const list = todaySessions
          .slice(0, 4)
          .map((entry) => `${entry.course.materia} (${entry.session.hora ?? 'sin hora'})`)
          .join(', ');
        return {
          intent: 'academic',
          reply: `Tus clases de hoy fueron: ${list}.`,
          suggestions: ['¿A qué hora entro mañana?', '¿Qué materias curso este semestre?'],
          context: baseContext,
        };
      }
    }

    if (/(manana|mañana)/.test(normalizedMessage)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const token = dayTokenForDate(tomorrow);
      const sessions = snapshot.courses.flatMap((course) =>
        (course.sessions ?? [])
          .filter((session) => hasDay(session.dias, token))
          .map((session) => ({ course, session, start: parseStartTime(session.hora) })),
      );

      sessions.sort((left, right) => (left.start ?? 9999) - (right.start ?? 9999));
      const first = sessions[0];

      return {
        intent: 'academic',
        reply: first
          ? `Mañana entras con ${first.course.materia} a las ${first.session.hora ?? 'hora por definir'}.`
          : 'No encontré clases programadas para mañana en tu snapshot.',
        suggestions: ['¿Qué clases tengo hoy?', '¿Cuál es mi siguiente clase?'],
        context: baseContext,
      };
    }

    return {
      intent: 'academic',
      reply:
        'Puedo consultar tu promedio, materias inscritas y clases por día con el snapshot académico sincronizado.',
      suggestions: ['¿Qué clases tengo hoy?', '¿Cuál es mi promedio?', '¿A qué hora entro mañana?'],
      context: baseContext,
    };
  }

  private handlePlatformIntent(
    normalizedMessage: string,
    baseContext: { lastDestinationPoiId?: string; lastDestinationLabel?: string },
  ): AssistantChatResponse {
    if (/(avatar|habbo)/.test(normalizedMessage)) {
      return {
        intent: 'platform',
        reply:
          'Para cambiar tu avatar ve a la sección Habbo Avatar en la barra superior, ajusta piezas/colores y guarda tu configuración.',
        suggestions: ['¿Cómo veo mi perfil RPG?', '¿Dónde está el mapa?'],
        context: baseContext,
      };
    }

    if (/(grupo de estudio|grupo|estudio)/.test(normalizedMessage)) {
      return {
        intent: 'platform',
        reply:
          'La función de grupos de estudio está planificada para el módulo social. Mientras tanto, usa Horario y Oferta para coordinar materias y profesores.',
        suggestions: ['¿Dónde veo mi horario?', '¿Cómo uso el mapa?'],
        context: baseContext,
      };
    }

    if (/(tramite|tramites|trámite|trámites)/.test(normalizedMessage)) {
      return {
        intent: 'platform',
        reply:
          'La sección de trámites está prevista como extensión del portal. Hoy puedes consultar avance académico, ruta en campus y oferta académica desde el menú principal.',
        suggestions: ['¿Cómo uso Oferta Académica?', '¿Cómo vinculo SIIAU?'],
        context: baseContext,
      };
    }

    if (/(siiau|vincular|cuenta)/.test(normalizedMessage)) {
      return {
        intent: 'platform',
        reply:
          'La vinculación con SIIAU ocurre al iniciar sesión con tu código y NIP; el sistema sincroniza snapshot académico y nunca almacena tu NIP.',
        suggestions: ['¿Qué datos académicos puedo consultar?', '¿Cómo ver mis clases de hoy?'],
        context: baseContext,
      };
    }

    return {
      intent: 'platform',
      reply:
        'CUCEIverse incluye mapa del campus, oferta académica, horario, perfil RPG y avatar. Puedo guiarte en cualquiera de esos módulos.',
      suggestions: ['¿Cómo uso el mapa?', '¿Cómo cambio mi avatar?', '¿Dónde veo mi horario?'],
      context: baseContext,
    };
  }
}
