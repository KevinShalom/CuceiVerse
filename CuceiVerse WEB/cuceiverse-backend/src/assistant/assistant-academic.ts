import type { SiiauSessionCacheService } from '../siiau/siiau-session-cache.service';
import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type {
  AssistantContextState,
  DayReference,
  SessionEntry,
} from './assistant.types';
import {
  dayTokenForDate,
  extractDayReference,
  hasDay,
  parseStartTime,
  summarizeList,
} from './assistant.utils';

function handleSpecificDaySchedule(
  snapshot: SessionEntry['snapshot'],
  normalizedMessage: string,
  dayReference: DayReference,
  baseContext: AssistantContextState,
): AssistantChatResponse {
  const sessions =
    snapshot?.courses.flatMap((course) =>
      (course.sessions ?? [])
        .filter((session) => hasDay(session.dias, dayReference.token))
        .map((session) => ({
          course,
          session,
          start: parseStartTime(session.hora),
        })),
    ) ?? [];

  sessions.sort((left, right) => (left.start ?? 9999) - (right.start ?? 9999));

  if (sessions.length === 0) {
    return {
      intent: 'academic',
      reply: `No encontre clases registradas para ${dayReference.label} en tu snapshot.`,
      suggestions: [
        'Que clases tengo hoy?',
        'A que hora entro manana?',
        'Que materias curso este semestre?',
      ],
      context: baseContext,
    };
  }

  if (/(primera|entro|a que hora)/.test(normalizedMessage)) {
    const first = sessions[0];
    return {
      intent: 'academic',
      reply: `Tu primera clase del ${dayReference.label} es **${first.course.materia}** a las **${first.session.hora ?? 'hora por definir'}**.`,
      suggestions: [
        'Que clases tengo hoy?',
        'Cual es mi siguiente clase?',
        'Cuantos creditos llevo?',
      ],
      context: baseContext,
    };
  }

  const summary = sessions
    .slice(0, 5)
    .map(
      (entry) =>
        `${entry.course.materia} (${entry.session.hora ?? 'sin hora'}${entry.session.aula ? `, ${entry.session.aula}` : ''})`,
    )
    .join(', ');

  return {
    intent: 'academic',
    reply: `Tus clases del ${dayReference.label} son: ${summary}.`,
    suggestions: [
      'Cual es mi promedio?',
      'Que clases tengo hoy?',
      'A que hora entro manana?',
    ],
    context: baseContext,
  };
}

export async function handleAcademicIntent(
  userId: string,
  normalizedMessage: string,
  baseContext: AssistantContextState,
  siiauSessionCacheService: SiiauSessionCacheService,
): Promise<AssistantChatResponse> {
  const session = (await siiauSessionCacheService.get(userId)) as SessionEntry;
  if (session.status !== 'ready' || !session.snapshot) {
    return {
      intent: 'academic',
      reply:
        'Aun no tengo tu snapshot academico listo. Abre Oferta Academica para terminar la sincronizacion con SIIAU.',
      suggestions: [
        'Que clases tengo hoy?',
        'Cual es mi promedio?',
        'Que materias curso este semestre?',
      ],
      context: baseContext,
    };
  }

  const snapshot = session.snapshot;
  const profile = snapshot.profile;

  if (
    /(hola|buenos dias|buenas tardes|que onda|quien eres|como te llamas)/.test(
      normalizedMessage,
    )
  ) {
    return {
      intent: 'general',
      reply:
        'Hola. Soy tu CuceiVerse Assistant. Puedo ayudarte con horario, promedio, oferta academica, tramites y rutas dentro del campus.',
      suggestions: [
        'Que clases tengo hoy?',
        'Necesito una constancia para beca',
        'Como llego a Control Escolar?',
      ],
      context: baseContext,
    };
  }

  if (/(promedio|average)/.test(normalizedMessage)) {
    const average = profile?.average ?? snapshot.profile?.average;
    return {
      intent: 'academic',
      reply:
        average == null
          ? 'Tu promedio todavia no aparece en el snapshot actual.'
          : `Tu promedio actual en SIIAU es **${Number(average).toFixed(2)}**.`,
      suggestions: [
        'Cuantos creditos llevo?',
        'Que clases tengo hoy?',
        'Que materias estoy cursando?',
      ],
      context: baseContext,
    };
  }

  if (/(credito)/.test(normalizedMessage)) {
    const earned = profile?.creditsEarned;
    const total = profile?.creditsTotal;
    const reply =
      earned == null
        ? 'Todavia no tengo el dato de creditos acumulados en tu snapshot.'
        : total == null
          ? `Llevas **${earned} creditos acumulados**.`
          : `Llevas **${earned} de ${total} creditos** acumulados.`;

    return {
      intent: 'academic',
      reply,
      suggestions: [
        'Cual es mi promedio?',
        'Que materias estoy cursando?',
        'Que clases tengo hoy?',
      ],
      context: baseContext,
    };
  }

  if (/(reprobad|pendient)/.test(normalizedMessage)) {
    const pending = profile?.pendingClasses ?? [];
    if (pending.length === 0) {
      return {
        intent: 'academic',
        reply:
          'No veo materias pendientes en el snapshot actual. Si quieres revisar un caso de articulo 33 o 34, tambien te puedo guiar con el tramite.',
        suggestions: [
          'Que hago si tengo articulo 33?',
          'Cual es mi promedio?',
          'Que materias curso este semestre?',
        ],
        context: baseContext,
      };
    }

    return {
      intent: 'academic',
      reply: `En tu snapshot veo pendientes: ${summarizeList(
        pending.map((item) => item.name),
        5,
      )}.`,
      suggestions: [
        'Que hago si tengo articulo 33?',
        'Cuantos creditos llevo?',
        'Que clases tengo hoy?',
      ],
      context: baseContext,
    };
  }

  if (/(materias|cursando|inscritas|este semestre)/.test(normalizedMessage)) {
    const names = snapshot.courses.map((course) => course.materia);
    return {
      intent: 'academic',
      reply:
        names.length === 0
          ? 'No encontre materias inscritas en tu snapshot actual.'
          : `Estas cursando: ${summarizeList(names, 8)}.`,
      suggestions: [
        'Que clases tengo hoy?',
        'Cual es mi siguiente clase?',
        'Cuantos creditos llevo?',
      ],
      context: baseContext,
    };
  }

  const dayReference = extractDayReference(normalizedMessage);
  if (dayReference) {
    return handleSpecificDaySchedule(
      snapshot,
      normalizedMessage,
      dayReference,
      baseContext,
    );
  }

  if (/(siguiente clase|siguiente materia)/.test(normalizedMessage)) {
    const today = new Date();
    const token = dayTokenForDate(today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    const todaySessions = snapshot.courses.flatMap((course) =>
      (course.sessions ?? [])
        .filter((session) => hasDay(session.dias, token))
        .map((session) => ({
          course,
          session,
          start: parseStartTime(session.hora),
        })),
    );

    todaySessions.sort(
      (left, right) => (left.start ?? 9999) - (right.start ?? 9999),
    );
    const nextClass = todaySessions.find(
      (entry) => (entry.start ?? 9999) >= nowMinutes,
    );

    return {
      intent: 'academic',
      reply: nextClass
        ? `Tu siguiente clase hoy es **${nextClass.course.materia}** a las **${nextClass.session.hora ?? 'hora por definir'}** en **${nextClass.session.aula || 'aula por definir'}**.`
        : 'Ya no encontre mas clases hoy en tu snapshot actual.',
      suggestions: [
        'Que clases tengo hoy?',
        'A que hora entro manana?',
        'Cual es mi promedio?',
      ],
      context: baseContext,
    };
  }

  return {
    intent: 'academic',
    reply:
      'Puedo consultar tu promedio, creditos, materias inscritas y clases por dia usando tu snapshot academico sincronizado.',
    suggestions: [
      'Que clases tengo hoy?',
      'Cual es mi promedio?',
      'Dime mi primera clase del lunes',
    ],
    context: baseContext,
  };
}
