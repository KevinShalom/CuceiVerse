import { AssistantService } from './assistant.service';
import { ASSISTANT_EVALUATION_CASES } from './assistant-evaluation.cases';

const poiData = [
  { id: 'poi-control', nombre: 'Control Escolar', nearestPathNodeId: 'n1' },
  { id: 'poi-registro', nombre: 'Registro Escolar', nearestPathNodeId: 'n2' },
  { id: 'poi-cafe', nombre: 'Cafeteria CTA', nearestPathNodeId: 'n3' },
  { id: 'poi-banos-q', nombre: 'Banos modulo Q', nearestPathNodeId: 'n4' },
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

function createService(offerMode = 'none') {
  const prisma = {
    puntoInteres: {
      findMany: jest.fn().mockResolvedValue(poiData),
    },
  };
  const pathfindingService = {
    calcularRuta: jest.fn().mockResolvedValue({ distanciaTotal: 42 }),
  };
  const siiauSessionCacheService = {
    get: jest.fn().mockResolvedValue({
      status: 'ready',
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
    }),
  };
  const offerService = {
    searchOferta: jest.fn(async (params: Record<string, unknown>) => {
      if (offerMode === 'none') return { total: 0, materias: [] };
      if (offerMode === 'single') return { total: 1, materias: [offerRows[0]] };
      if (offerMode === 'ambiguous') return { total: 2, materias: offerRows };
      if (offerMode === 'typoFallback') {
        if (params.limit === 50) return { total: 2, materias: offerRows };
        return { total: 0, materias: [] };
      }
      return { total: 0, materias: [] };
    }),
  };
  const nlpService = {
    process: jest.fn((message: string) => {
      const normalized = message.toLowerCase();
      if (
        normalized.includes('curso este semestre') ||
        normalized.includes('clases tengo el lunes') ||
        normalized.includes('promedio') ||
        normalized.includes('creditos')
      ) {
        return createNlpResult('academic');
      }
      if (
        normalized.includes('llego') ||
        normalized.includes('llevame') ||
        normalized.includes('estoy en') ||
        normalized.includes('me encuentro')
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

describe('assistant evaluation corpus', () => {
  it.each(ASSISTANT_EVALUATION_CASES)('$name', async (testCase) => {
    const service = createService(testCase.offerMode);
    const response = await service.chat(
      { id: 'user-1', siiauCode: '123' },
      {
        message: testCase.message,
        context: testCase.context ?? {},
      },
    );

    expect(response.intent).toBe(testCase.expectedIntent);

    if (testCase.expectsClarification !== undefined) {
      if (testCase.expectsClarification) {
        expect(response.context.pendingClarificationType).toBeDefined();
      } else {
        expect(response.context.pendingClarificationType).toBeUndefined();
      }
    }

    if (testCase.expectsAction !== undefined) {
      if (testCase.expectsAction) {
        expect(response.action?.type).toBe('highlight-route');
      } else {
        expect(response.action).toBeUndefined();
      }
    }

    for (const fragment of testCase.replyIncludes ?? []) {
      expect(response.reply).toContain(fragment);
    }
  });
});
