import { AssistantService } from './assistant.service';
import type { AssistantContextState } from './assistant.types';
import { buildAssistantContextState } from './assistant.utils';

const poiData = [
  { id: 'poi-control', nombre: 'Control Escolar', nearestPathNodeId: 'n1' },
  { id: 'poi-registro', nombre: 'Registro Escolar', nearestPathNodeId: 'n2' },
  { id: 'poi-cafe', nombre: 'CTA Cafeteria', nearestPathNodeId: 'n3' },
  { id: 'poi-banos-q', nombre: 'Banos modulo Q', nearestPathNodeId: 'n4' },
  {
    id: 'poi-cid',
    nombre: 'Modulo de Informacion CID',
    nearestPathNodeId: 'n5',
  },
  { id: 'poi-mod-x', nombre: 'Modulo X', nearestPathNodeId: 'n6' },
  { id: 'poi-mod-u', nombre: 'Modulo U', nearestPathNodeId: 'n7' },
  {
    id: 'poi-matute',
    nombre: 'Auditorio Matute Remus',
    nearestPathNodeId: 'n8',
  },
];

const offerRows = [
  {
    Materia: 'Bases de Datos',
    Profesor: 'Zepeda',
    Edificio: 'U',
    Aula: 'A1',
    Dias: 'L',
    Hora: '0900-1100',
  },
  {
    Materia: 'Bases de Datos Avanzadas',
    Profesor: 'Orozco',
    Edificio: 'Y',
    Aula: 'B2',
    Dias: 'M',
    Hora: '1100-1300',
  },
];

function createNlpResult(intent: string) {
  return {
    intent,
    score: 0.9,
    entities: [],
    utterance: '',
  };
}

function createService(pois = poiData) {
  const prisma = {
    puntoInteres: {
      findMany: jest.fn().mockResolvedValue(pois),
    },
  };
  const pathfindingService = {
    calcularRuta: jest.fn().mockResolvedValue({ distanciaTotal: 45 }),
  };
  const siiauSessionCacheService = {
    get: jest.fn().mockResolvedValue({
      status: 'ready',
      snapshot: {
        profile: {
          average: 93.5,
          creditsEarned: 120,
          creditsTotal: 180,
          pendingClasses: [],
        },
        courses: [
          {
            nrc: '12345',
            materia: 'Bases de Datos',
            clave: 'I7020',
            sessions: [
              {
                hora: '0900-1100',
                dias: 'L',
                aula: 'A1',
                profesor: 'Zepeda',
                edif: 'U',
              },
            ],
          },
        ],
      },
      error: null,
    }),
  };
  const offerService = {
    searchOferta: jest.fn(async (params: Record<string, unknown>) => {
      if (params.limit === 50) return { total: 2, materias: offerRows };
      if (params.materia || params.profesor) {
        return { total: 1, materias: [offerRows[0]] };
      }
      if (params.edificio) return { total: 2, materias: offerRows };
      if (params.q) return { total: 2, materias: offerRows };
      return { total: 0, materias: [] };
    }),
  };
  const nlpService = {
    process: jest.fn((message: string) => {
      const normalized = message.toLowerCase();
      if (
        normalized.includes('promedio') ||
        normalized.includes('creditos') ||
        normalized.includes('curso este semestre') ||
        normalized.includes('clases tengo')
      ) {
        return createNlpResult('academic');
      }
      if (
        normalized.includes('llego') ||
        normalized.includes('llevame') ||
        normalized.includes('estoy en') ||
        normalized.includes('me encuentro') ||
        normalized.includes('ando por')
      ) {
        return createNlpResult('navigation');
      }
      if (
        normalized.includes('constancia') ||
        normalized.includes('constansia') ||
        normalized.includes('tramite') ||
        normalized.includes('revalidacion') ||
        normalized.includes('articulo')
      ) {
        return createNlpResult('administrative');
      }
      if (
        normalized.includes('base') ||
        normalized.includes('bases') ||
        normalized.includes('profesor') ||
        normalized.includes('materia') ||
        normalized.includes('modulo')
      ) {
        return createNlpResult('academic_search');
      }
      if (normalized.includes('avatar')) return createNlpResult('platform');
      return createNlpResult('general');
    }),
  };

  return new AssistantService(
    prisma as never,
    pathfindingService as never,
    siiauSessionCacheService as never,
    offerService as never,
    nlpService as never,
  );
}

async function send(
  service: AssistantService,
  message: string,
  context: AssistantContextState,
) {
  const response = await service.chat(
    { id: 'user-1', siiauCode: '123' },
    { message, context },
  );
  return { response, context: buildAssistantContextState(response.context) };
}

describe('assistant user journeys', () => {
  it('handles a real route flow from pending destination and module X origin', async () => {
    const service = createService();
    let context: AssistantContextState = {};

    let turn = await send(service, 'Llevame a CTA Cafeteria', context);
    context = turn.context;
    expect(turn.response.intent).toBe('navigation');
    expect(turn.response.context.pendingClarificationType).toBe(
      'missing_origin',
    );

    turn = await send(service, 'estoy en el X', context);
    expect(turn.response.action?.type).toBe('highlight-route');
    expect(turn.response.action?.originLabel).toBe('Modulo X');
    expect(turn.response.action?.destinationLabel).toBe('CTA Cafeteria');
    expect(turn.response.reply).not.toContain('Modulo de Informacion CID');
  });

  it('does not invent CID when a short module origin is not registered', async () => {
    const service = createService(
      poiData.filter((poi) => poi.id !== 'poi-mod-x'),
    );
    const context: AssistantContextState = {
      pendingDestinationPoiId: 'poi-cafe',
      pendingDestinationLabel: 'CTA Cafeteria',
      lastDestinationPoiId: 'poi-cafe',
      lastDestinationLabel: 'CTA Cafeteria',
      pendingClarificationType: 'missing_origin',
    };

    const { response } = await send(service, 'estoy en el X', context);
    expect(response.action).toBeUndefined();
    expect(response.reply).toContain('primero necesito saber donde estas');
    expect(response.reply).not.toContain('Modulo de Informacion CID');
  });

  it('clarifies ambiguous escolar, accepts selection, then completes route', async () => {
    const service = createService();
    let context: AssistantContextState = {};

    let turn = await send(service, 'Como llego a escolar?', context);
    context = turn.context;
    expect(turn.response.context.pendingClarificationType).toBe(
      'ambiguous_destination',
    );
    expect(turn.response.suggestions).toEqual(
      expect.arrayContaining(['Control Escolar', 'Registro Escolar']),
    );

    turn = await send(service, 'Control Escolar', context);
    context = turn.context;
    expect(turn.response.context.pendingClarificationType).toBe(
      'missing_origin',
    );

    turn = await send(service, 'Ando por CTA Cafeteria', context);
    expect(turn.response.action?.originLabel).toBe('CTA Cafeteria');
    expect(turn.response.action?.destinationLabel).toBe('Control Escolar');
  });

  it('keeps simple academic questions frictionless during navigation context', async () => {
    const service = createService();
    const context: AssistantContextState = {
      pendingClarificationType: 'missing_origin',
      pendingDestinationPoiId: 'poi-control',
      pendingDestinationLabel: 'Control Escolar',
      lastResolvedIntent: 'navigation',
    };

    const { response } = await send(service, 'Cual es mi promedio?', context);
    expect(response.intent).toBe('academic');
    expect(response.reply).toContain('93.50');
    expect(response.context.pendingClarificationType).toBeUndefined();
  });

  it('uses recent route context for reference messages like ahi', async () => {
    const service = createService();
    const context: AssistantContextState = {
      lastOriginPoiId: 'poi-cafe',
      lastOriginLabel: 'CTA Cafeteria',
      lastDestinationPoiId: 'poi-control',
      lastDestinationLabel: 'Control Escolar',
    };

    const { response } = await send(service, 'Llevame ahi', context);
    expect(response.action?.type).toBe('highlight-route');
    expect(response.action?.destinationLabel).toBe('Control Escolar');
  });

  it('does not choose arbitrary offer result for broad query and resolves selected subject', async () => {
    const service = createService();
    let context: AssistantContextState = {};

    let turn = await send(service, 'bases', context);
    context = turn.context;
    expect(turn.response.intent).toBe('academic');
    expect(turn.response.context.pendingClarificationType).toBe(
      'ambiguous_subject',
    );

    turn = await send(service, 'Materia: Bases de Datos', context);
    expect(turn.response.reply).toContain('Bases de Datos');
    expect(turn.response.context.pendingClarificationType).toBeUndefined();
  });

  it('answers administrative broad query with guided options and specific query with details', async () => {
    const service = createService();

    const broad = await send(service, 'Necesito una constancia', {});
    expect(broad.response.intent).toBe('administrative');
    expect(broad.response.context.pendingClarificationType).toBeDefined();
    expect(broad.response.reply).toContain('Cual necesitas exactamente');

    const specific = await send(
      service,
      'Necesito una constancia para beca',
      broad.context,
    );
    expect(specific.response.intent).toBe('administrative');
    expect(specific.response.context.pendingClarificationType).toBeUndefined();
    expect(specific.response.reply).toContain('Constancia');
  });

  it('handles typo routes, platform help, unknown destinations and academic snapshot', async () => {
    const service = createService();

    const typoRoute = await send(
      service,
      'Como llego a contrl escolar desde CTA Cafeteria',
      {},
    );
    expect(typoRoute.response.action?.originLabel).toBe('CTA Cafeteria');
    expect(typoRoute.response.action?.destinationLabel).toBe('Control Escolar');

    const platform = await send(service, 'Como cambio mi avatar?', {});
    expect(platform.response.intent).toBe('platform');
    expect(platform.response.reply).toContain('Habbo Avatar');

    const unknown = await send(
      service,
      'Como llego al edificio unicornio?',
      {},
    );
    expect(unknown.response.intent).toBe('navigation');
    expect(unknown.response.action).toBeUndefined();

    const monday = await send(service, 'Que clases tengo el lunes?', {});
    expect(monday.response.intent).toBe('academic');
    expect(monday.response.reply).toContain('Bases de Datos');
  });
});
