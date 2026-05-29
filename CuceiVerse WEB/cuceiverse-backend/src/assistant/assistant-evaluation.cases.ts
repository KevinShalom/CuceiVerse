import type { AssistantContextState } from './assistant.types';

export type AssistantEvaluationCase = {
  name: string;
  message: string;
  context?: AssistantContextState;
  expectedIntent:
    | 'navigation'
    | 'academic'
    | 'administrative'
    | 'platform'
    | 'general';
  expectsClarification?: boolean;
  expectsAction?: boolean;
  replyIncludes?: string[];
  offerMode?: 'none' | 'ambiguous' | 'single' | 'typoFallback';
};

export const ASSISTANT_EVALUATION_CASES: AssistantEvaluationCase[] = [
  {
    name: 'navigation ambiguous escolar',
    message: 'Como llego a escolar?',
    expectedIntent: 'navigation',
    expectsClarification: true,
    replyIncludes: ['opciones parecidas'],
  },
  {
    name: 'navigation typo control escolar',
    message: 'Como llego a contrl escolar desde Cafeteria CTA',
    expectedIntent: 'navigation',
    expectsAction: true,
    replyIncludes: ['Control Escolar'],
  },
  {
    name: 'navigation cafe alias',
    message: 'Como llego a cafe cta desde Control Escolar',
    expectedIntent: 'navigation',
    expectsAction: true,
    replyIncludes: ['Cafeteria CTA'],
  },
  {
    name: 'navigation missing origin',
    message: 'Llevame a Control Escolar',
    expectedIntent: 'navigation',
    expectsClarification: true,
    replyIncludes: ['donde estas'],
  },
  {
    name: 'navigation pending origin completion',
    message: 'Estoy en Cafeteria CTA',
    context: {
      pendingDestinationPoiId: 'poi-control',
      pendingDestinationLabel: 'Control Escolar',
      lastDestinationPoiId: 'poi-control',
      lastDestinationLabel: 'Control Escolar',
      pendingClarificationType: 'missing_origin',
    },
    expectedIntent: 'navigation',
    expectsAction: true,
    replyIncludes: ['Control Escolar'],
  },
  {
    name: 'navigation reference ahi',
    message: 'Llevame ahi',
    context: {
      lastOriginPoiId: 'poi-cafe',
      lastOriginLabel: 'Cafeteria CTA',
      lastDestinationPoiId: 'poi-control',
      lastDestinationLabel: 'Control Escolar',
    },
    expectedIntent: 'navigation',
    expectsAction: true,
  },
  {
    name: 'offer ambiguous query',
    message: 'bases',
    expectedIntent: 'academic',
    expectsClarification: true,
    offerMode: 'ambiguous',
    replyIncludes: ['varias opciones'],
  },
  {
    name: 'offer typo fallback',
    message: 'base de dats',
    expectedIntent: 'academic',
    expectsClarification: true,
    offerMode: 'typoFallback',
    replyIncludes: ['varias opciones'],
  },
  {
    name: 'offer selected subject follow-up',
    message: 'Materia: Bases de Datos',
    context: {
      pendingClarificationType: 'ambiguous_subject',
      pendingClarificationOptions: [
        'Materia: Bases de Datos',
        'Profesor: Zepeda',
      ],
      lastResolvedIntent: 'academic',
    },
    expectedIntent: 'academic',
    offerMode: 'single',
    replyIncludes: ['Bases de Datos'],
  },
  {
    name: 'offer professor query',
    message: 'profesor zepeda',
    expectedIntent: 'academic',
    offerMode: 'single',
    replyIncludes: ['Zepeda'],
  },
  {
    name: 'offer building query',
    message: 'materias en el modulo u',
    expectedIntent: 'academic',
    offerMode: 'ambiguous',
    replyIncludes: ['Modulo'],
  },
  {
    name: 'administrative broad constancia',
    message: 'Necesito una constancia',
    expectedIntent: 'administrative',
    expectsClarification: true,
    replyIncludes: ['Cual necesitas exactamente'],
  },
  {
    name: 'administrative typo constancia',
    message: 'Necesito una constansia',
    expectedIntent: 'administrative',
    expectsClarification: true,
    replyIncludes: ['Cual necesitas exactamente'],
  },
  {
    name: 'administrative specific beca',
    message: 'Necesito una constancia para beca',
    expectedIntent: 'administrative',
    replyIncludes: ['Constancia'],
  },
  {
    name: 'administrative article 33',
    message: 'Que hago si tengo articulo 33?',
    expectedIntent: 'administrative',
    replyIncludes: ['Art. 33'],
  },
  {
    name: 'administrative revalidacion broad',
    message: 'revalidacion',
    expectedIntent: 'administrative',
    expectsClarification: true,
    replyIncludes: ['varios tramites'],
  },
  {
    name: 'academic average',
    message: 'Cual es mi promedio?',
    expectedIntent: 'academic',
    replyIncludes: ['91.25'],
  },
  {
    name: 'academic credits',
    message: 'Cuantos creditos llevo?',
    expectedIntent: 'academic',
    replyIncludes: ['120'],
  },
  {
    name: 'academic enrolled subjects',
    message: 'Que materias curso este semestre?',
    expectedIntent: 'academic',
    replyIncludes: ['Bases de Datos'],
  },
  {
    name: 'academic today classes',
    message: 'Que clases tengo el lunes?',
    expectedIntent: 'academic',
    replyIncludes: ['Bases de Datos'],
  },
  {
    name: 'platform avatar',
    message: 'Como cambio mi avatar?',
    expectedIntent: 'platform',
    replyIncludes: ['Habbo Avatar'],
  },
  {
    name: 'topic change clears pending clarification',
    message: 'Cual es mi promedio?',
    context: {
      pendingClarificationType: 'ambiguous_destination',
      pendingClarificationOptions: ['Control Escolar', 'Registro Escolar'],
      lastResolvedIntent: 'navigation',
    },
    expectedIntent: 'academic',
    replyIncludes: ['91.25'],
  },
  {
    name: 'stale unclear clarification remains pending',
    message: 'no se',
    context: {
      pendingClarificationType: 'ambiguous_destination',
      pendingClarificationOptions: ['Control Escolar', 'Registro Escolar'],
      lastResolvedIntent: 'navigation',
    },
    expectedIntent: 'navigation',
    expectsClarification: true,
    replyIncludes: ['aclaracion pendiente'],
  },
  {
    name: 'missing origin accepts free text origin',
    message: 'me encuentro en Control Escolar',
    context: {
      pendingDestinationPoiId: 'poi-cafe',
      pendingDestinationLabel: 'Cafeteria CTA',
      lastDestinationPoiId: 'poi-cafe',
      lastDestinationLabel: 'Cafeteria CTA',
      pendingClarificationType: 'missing_origin',
    },
    expectedIntent: 'navigation',
    expectsAction: true,
    replyIncludes: ['Cafeteria CTA'],
  },
  {
    name: 'navigation same origin and destination',
    message: 'Como llego a Control Escolar',
    context: {
      lastOriginPoiId: 'poi-control',
      lastOriginLabel: 'Control Escolar',
    },
    expectedIntent: 'navigation',
    replyIncludes: ['Ya estas'],
  },
];
