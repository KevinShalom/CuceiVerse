import { AssistantService } from './assistant.service';
import type { AssistantContextState } from './assistant.types';

function createNlpResult(
  intent:
    | 'academic_search'
    | 'administrative'
    | 'navigation'
    | 'platform'
    | 'general'
    | 'None',
) {
  return {
    intent,
    score: 0.9,
    entities: [],
    utterance: '',
  };
}

describe('AssistantService', () => {
  const poiData = [
    { id: 'poi-control', nombre: 'Control Escolar', nearestPathNodeId: 'n1' },
    { id: 'poi-registro', nombre: 'Registro Escolar', nearestPathNodeId: 'n2' },
    { id: 'poi-cafe', nombre: 'Cafeteria CTA', nearestPathNodeId: 'n3' },
    { id: 'poi-banos-q', nombre: 'Banos modulo Q', nearestPathNodeId: 'n4' },
    {
      id: 'poi-cid',
      nombre: 'Modulo de Informacion CID',
      nearestPathNodeId: 'n5',
    },
    { id: 'poi-mod-x', nombre: 'Modulo X', nearestPathNodeId: 'n6' },
  ];

  const academicSnapshot = {
    status: 'ready' as const,
    snapshot: {
      profile: {
        average: 91.25,
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
  };

  function createService(pois = poiData) {
    const prisma = {
      puntoInteres: {
        findMany: jest.fn().mockResolvedValue(pois),
      },
    };
    const pathfindingService = {
      calcularRuta: jest.fn().mockResolvedValue({ distanciaTotal: 42 }),
    };
    const siiauSessionCacheService = {
      get: jest.fn().mockResolvedValue(academicSnapshot),
    };
    const offerService = {
      searchOferta: jest.fn().mockResolvedValue({
        total: 0,
        materias: [],
      }),
    };
    const nlpService = {
      process: jest.fn((message: string) => {
        const normalized = message.toLowerCase();
        if (
          normalized.includes('llego') ||
          normalized.includes('llevame') ||
          normalized.includes('estoy en') ||
          normalized.includes('escolar')
        ) {
          return createNlpResult('navigation');
        }
        if (
          normalized.includes('constancia') ||
          normalized.includes('tramite') ||
          normalized.includes('revalidacion')
        ) {
          return createNlpResult('administrative');
        }
        if (
          normalized.includes('bases') ||
          normalized.includes('profesor:') ||
          normalized.includes('materia:')
        ) {
          return createNlpResult('academic_search');
        }
        if (normalized.includes('avatar')) {
          return createNlpResult('platform');
        }
        return createNlpResult('general');
      }),
    };

    const service = new AssistantService(
      prisma as never,
      pathfindingService as never,
      siiauSessionCacheService as never,
      offerService as never,
      nlpService as never,
    );

    return {
      service,
      prisma,
      pathfindingService,
      siiauSessionCacheService,
      offerService,
      nlpService,
    };
  }

  it('asks for clarification on ambiguous destination', async () => {
    const { service } = createService();

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Como llego a escolar?', context: {} },
    );

    expect(response.intent).toBe('navigation');
    expect(response.reply).toContain('¿Te refieres');
    expect(response.suggestions).toEqual(
      expect.arrayContaining(['Control Escolar', 'Registro Escolar']),
    );
    expect(response.context.pendingClarificationType).toBe(
      'ambiguous_destination',
    );
  });

  it('resolves llevame ahi using recent context', async () => {
    const { service } = createService();
    const context: AssistantContextState = {
      lastOriginPoiId: 'poi-cafe',
      lastOriginLabel: 'Cafeteria CTA',
      lastDestinationPoiId: 'poi-control',
      lastDestinationLabel: 'Control Escolar',
    };

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Llevame ahi', context },
    );

    expect(response.intent).toBe('navigation');
    expect(response.action?.type).toBe('highlight-route');
    expect(response.action?.destinationLabel).toBe('Control Escolar');
  });

  it('completes route after pending destination when user shares origin', async () => {
    const { service } = createService();
    const context: AssistantContextState = {
      pendingDestinationPoiId: 'poi-control',
      pendingDestinationLabel: 'Control Escolar',
      lastDestinationPoiId: 'poi-control',
      lastDestinationLabel: 'Control Escolar',
      pendingClarificationType: 'missing_origin',
    };

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Estoy en Cafeteria CTA', context },
    );

    expect(response.intent).toBe('navigation');
    expect(response.action?.destinationLabel).toBe('Control Escolar');
    expect(response.action?.originLabel).toBe('Cafeteria CTA');
  });

  it('resolves short module origin exactly instead of a generic modulo POI', async () => {
    const { service } = createService();
    const context: AssistantContextState = {
      pendingDestinationPoiId: 'poi-cafe',
      pendingDestinationLabel: 'Cafeteria CTA',
      lastDestinationPoiId: 'poi-cafe',
      lastDestinationLabel: 'Cafeteria CTA',
      pendingClarificationType: 'missing_origin',
    };

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Estoy en el X', context },
    );

    expect(response.intent).toBe('navigation');
    expect(response.action?.type).toBe('highlight-route');
    expect(response.action?.originLabel).toBe('Modulo X');
    expect(response.action?.originLabel).not.toBe('Modulo de Informacion CID');
  });

  it('does not use Modulo de Informacion CID as fallback for unknown module letters', async () => {
    const poisWithoutModuleX = poiData.filter((poi) => poi.id !== 'poi-mod-x');
    const { service } = createService(poisWithoutModuleX);
    const context: AssistantContextState = {
      pendingDestinationPoiId: 'poi-cafe',
      pendingDestinationLabel: 'Cafeteria CTA',
      lastDestinationPoiId: 'poi-cafe',
      lastDestinationLabel: 'Cafeteria CTA',
      pendingClarificationType: 'missing_origin',
    };

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Estoy en el X', context },
    );

    expect(response.intent).toBe('navigation');
    expect(response.action).toBeUndefined();
    expect(response.reply).toContain('primero necesito saber donde estas');
  });

  it('does not return arbitrary first match for ambiguous offer search', async () => {
    const { service, offerService } = createService();
    offerService.searchOferta = jest.fn().mockResolvedValue({
      total: 2,
      materias: [
        {
          Materia: 'Bases de Datos',
          Profesor: 'Zepeda',
          Edificio: 'U',
        },
        {
          Materia: 'Bases de Datos Avanzadas',
          Profesor: 'Orozco',
          Edificio: 'Y',
        },
      ],
    });

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'bases', context: {} },
    );

    expect(response.intent).toBe('academic');
    expect(response.reply).toContain('varias opciones');
    expect(response.context.pendingClarificationType).toBe('ambiguous_subject');
    expect(response.action).toBeUndefined();
  });

  it('asks to specify administrative procedure instead of dumping category summary', async () => {
    const { service } = createService();

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Necesito una constancia', context: {} },
    );

    expect(response.intent).toBe('administrative');
    expect(response.reply).toContain('¿Cual necesitas exactamente?');
    expect(response.suggestions[0]).toContain('Necesito');
  });

  it('clears stale clarification when user changes topic', async () => {
    const { service } = createService();
    const context: AssistantContextState = {
      pendingClarificationType: 'ambiguous_destination',
      pendingClarificationOptions: ['Control Escolar', 'Registro Escolar'],
      lastResolvedIntent: 'navigation',
    };

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Cual es mi promedio?', context },
    );

    expect(response.intent).toBe('academic');
    expect(response.context.pendingClarificationType).toBeUndefined();
    expect(response.reply).toContain('91.25');
  });

  it('still answers simple academic questions directly', async () => {
    const { service } = createService();

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      { message: 'Cual es mi promedio?', context: {} },
    );

    expect(response.intent).toBe('academic');
    expect(response.reply).toContain('91.25');
  });

  it('keeps highlight-route action for valid route response', async () => {
    const { service } = createService();

    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      {
        message: 'Como llego a Control Escolar desde Cafeteria CTA',
        context: {},
      },
    );

    expect(response.intent).toBe('navigation');
    expect(response.action).toEqual(
      expect.objectContaining({
        type: 'highlight-route',
        destinationLabel: 'Control Escolar',
        originLabel: 'Cafeteria CTA',
      }),
    );
  });
});
