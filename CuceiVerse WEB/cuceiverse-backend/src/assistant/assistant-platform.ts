import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type { AssistantContextState } from './assistant.types';

export function handlePlatformIntent(
  normalizedMessage: string,
  baseContext: AssistantContextState,
): AssistantChatResponse {
  if (/(avatar|habbo)/.test(normalizedMessage)) {
    return {
      intent: 'platform',
      reply:
        'Para cambiar tu avatar ve a la seccion **Habbo Avatar**, ajusta piezas y colores, y guarda la configuracion.',
      suggestions: [
        'Donde esta el mapa?',
        'Como veo mi perfil RPG?',
        'Como uso Oferta Academica?',
      ],
      context: baseContext,
    };
  }

  if (/(mapa|ruta|campus)/.test(normalizedMessage)) {
    return {
      intent: 'platform',
      reply:
        'En el mapa puedes trazar rutas dentro del campus, acercarte al avatar y ubicar edificios, servicios y oficinas clave.',
      suggestions: [
        'Como llego a Control Escolar?',
        'Que hay cerca de ahi?',
        'Donde esta el Auditorio Matute?',
      ],
      context: baseContext,
    };
  }

  if (/(siiau|vincular|cuenta)/.test(normalizedMessage)) {
    return {
      intent: 'platform',
      reply:
        'La vinculacion con SIIAU ocurre al iniciar sesion con tu codigo y NIP. CUCEIverse usa el snapshot sincronizado y no conserva tu NIP para responder preguntas academicas.',
      suggestions: [
        'Que clases tengo hoy?',
        'Cual es mi promedio?',
        'Cuantos creditos llevo?',
      ],
      context: baseContext,
    };
  }

  return {
    intent: 'platform',
    reply:
      'CUCEIverse integra mapa, oferta academica, horario, perfil RPG, avatar y guia de tramites. Dime que modulo quieres usar y te guio.',
    suggestions: [
      'Como uso el mapa?',
      'Necesito una constancia para beca',
      'Que clases tengo hoy?',
    ],
    context: baseContext,
  };
}
