import { TRAMITES_DATA, type TramiteRecord } from './data/tramites.data';
import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type {
  AssistantContextState,
  AssistantPoiResolver,
} from './assistant.types';
import { buildClarificationDecision } from './assistant-conversation';
import { buildReply } from './assistant-replies';
import {
  clearPendingClarification,
  isAdministrativeFollowUpMessage,
  normalizeText,
  textSimilarity,
  tokenSimilarityScore,
  TRAMITE_STOPWORDS,
  withResolvedContext,
} from './assistant.utils';

type AdministrativeDependencies = {
  resolvePoiFromText: AssistantPoiResolver;
};

function isBroadAdministrativeCategoryQuery(
  normalizedMessage: string,
  category: TramiteRecord['category'],
): boolean {
  const tokens = normalizedMessage
    .split(' ')
    .filter((token) => token.length > 2 && !TRAMITE_STOPWORDS.has(token));
  const specificityTokens = new Set([
    'beca',
    'calificaciones',
    'imss',
    'preparatoria',
    'nacimiento',
    'kardex',
    'certificado',
    'certificada',
    'articulo',
    'licencia',
  ]);
  if (tokens.some((token) => specificityTokens.has(token))) return false;
  if (tokens.length <= 2) return true;
  if (category === 'Constancias' && tokens.includes('constancia')) return true;
  if (category === 'Revalidación' && tokens.includes('revalidacion'))
    return true;
  if (category === 'Titulación' && tokens.includes('titulacion')) return true;
  return false;
}

function resolveAdministrativeCategory(
  normalizedMessage: string,
): TramiteRecord['category'] | null {
  if (
    normalizedMessage.includes('revalidacion') ||
    normalizedMessage.includes('equivalencia')
  ) {
    return 'Revalidación';
  }
  if (
    normalizedMessage.includes('titulacion') ||
    normalizedMessage.includes('egresado')
  ) {
    return 'Titulación';
  }
  if (
    normalizedMessage.includes('licencia') ||
    normalizedMessage.includes('competencias') ||
    normalizedMessage.includes('validacion')
  ) {
    return 'Académico';
  }
  if (
    normalizedMessage.includes('revalidacion') ||
    normalizedMessage.includes('equivalencia')
  ) {
    return 'Revalidación';
  }
  if (
    normalizedMessage.includes('constancia') ||
    normalizedMessage.includes('constansia') ||
    normalizedMessage.includes('kardex') ||
    normalizedMessage.includes('certificada')
  ) {
    return 'Constancias';
  }
  if (
    normalizedMessage.includes('titulacion') ||
    normalizedMessage.includes('egresado')
  ) {
    return 'Titulación';
  }
  if (
    normalizedMessage.includes('baja') ||
    normalizedMessage.includes('reingreso')
  ) {
    return 'Bajas';
  }
  if (
    normalizedMessage.includes('licencia') ||
    normalizedMessage.includes('competencias') ||
    normalizedMessage.includes('validacion')
  ) {
    return 'Académico';
  }
  if (
    normalizedMessage.includes('articulo 33') ||
    normalizedMessage.includes('articulo 34') ||
    normalizedMessage.includes('agenda')
  ) {
    return 'Aclaraciones';
  }
  if (normalizedMessage.includes('imss')) {
    return 'Servicios';
  }

  const categoryAliases: Array<{
    category: string;
    aliases: string[];
  }> = [
    {
      category: 'Constancias',
      aliases: ['constancia', 'constancias', 'kardex'],
    },
    {
      category: 'RevalidaciÃ³n',
      aliases: ['revalidacion', 'equivalencia', 'acreditacion'],
    },
    { category: 'TitulaciÃ³n', aliases: ['titulacion', 'egresado'] },
    { category: 'Bajas', aliases: ['baja', 'reingreso'] },
    { category: 'AcadÃ©mico', aliases: ['licencia', 'validacion'] },
    { category: 'Aclaraciones', aliases: ['articulo', 'agenda', 'aclaracion'] },
    { category: 'Servicios', aliases: ['imss', 'servicio medico'] },
  ];

  const match = categoryAliases.find((entry) =>
    entry.aliases.some(
      (alias) =>
        textSimilarity(normalizedMessage, alias) >= 0.75 ||
        tokenSimilarityScore(normalizedMessage, alias) >= 0.8,
    ),
  );
  if (match) return match.category as TramiteRecord['category'];

  return null;
}

function resolveBestTramite(
  normalizedMessage: string,
): { record: TramiteRecord; score: number } | null {
  const tokens = normalizedMessage
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !TRAMITE_STOPWORDS.has(token));

  const ranked = TRAMITES_DATA.map((record) => {
    const title = normalizeText(record.title);
    const description = normalizeText(record.description);
    const location = normalizeText(record.location);
    const requirements = normalizeText(record.requirements.join(' '));
    const category = normalizeText(record.category);
    let score = 0;

    if (title.includes(normalizedMessage)) score += 150;
    if (normalizedMessage.includes(title)) score += 120;
    if (
      record.aliases.some((alias) =>
        normalizedMessage.includes(normalizeText(alias)),
      )
    ) {
      score += 95;
    }

    const titleSimilarity = Math.max(
      textSimilarity(normalizedMessage, title),
      tokenSimilarityScore(normalizedMessage, title),
    );
    if (titleSimilarity >= 0.68) score += Math.round(titleSimilarity * 70);

    const aliasSimilarity = record.aliases.reduce(
      (best, alias) =>
        Math.max(
          best,
          textSimilarity(normalizedMessage, alias),
          tokenSimilarityScore(normalizedMessage, alias),
        ),
      0,
    );
    if (aliasSimilarity >= 0.72) score += Math.round(aliasSimilarity * 60);

    for (const token of tokens) {
      if (title.includes(token)) score += token.length * 8;
      if (location.includes(token)) score += token.length * 5;
      if (description.includes(token)) score += token.length * 3;
      if (requirements.includes(token)) score += token.length * 2;
      if (category.includes(token)) score += token.length * 3;
      if (tokenSimilarityScore(token, title) >= 0.82) score += token.length * 4;
    }

    return { record, score };
  }).sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 25) return null;
  return ranked[0];
}

function getAdministrativeTramiteFromContext(
  baseContext: AssistantContextState,
): TramiteRecord | null {
  if (!baseContext.lastAdministrativeTramiteId) return null;
  return (
    TRAMITES_DATA.find(
      (record) => record.id === baseContext.lastAdministrativeTramiteId,
    ) ?? null
  );
}

function buildAdministrativeContext(
  baseContext: AssistantContextState,
  tramite?: TramiteRecord | null,
  extraContext?: AssistantContextState,
): AssistantContextState {
  return {
    ...baseContext,
    ...(extraContext ?? {}),
    lastAdministrativeTramiteId: tramite?.id,
    lastAdministrativeTramiteTitle: tramite?.title,
    lastAdministrativeCategory:
      tramite?.category ?? baseContext.lastAdministrativeCategory,
    lastAdministrativeLocation: tramite?.location,
  };
}

function buildAdministrativeFlow(tramite: TramiteRecord): string[] {
  switch (tramite.id) {
    case '10':
    case '11':
    case '12':
      return [
        'Primero inicia la solicitud en SIATSE dentro de "Acreditacion y Revalidacion".',
        'Despues reune los originales y copias que pide tu caso.',
        'Finalmente entrega el expediente en Control Escolar (Modulo A, Proulex).',
      ];
    case '14':
      return [
        'Primero liquida cualquier adeudo pendiente en SIIAU.',
        'Despues entra a SIATSE y solicita el tramite de reingreso.',
        'Finalmente revisa la respuesta directamente en la plataforma.',
      ];
    case '22':
      return [
        'Primero valida que estas en fechas del calendario y sin adeudos.',
        'Despues entra a SIATSE y levanta la Solicitud de Licencia.',
        'Finalmente consulta el resultado en la misma plataforma.',
      ];
    case '23':
      return [
        'Primero revisa en SIIAU que no tengas adeudos y realiza el pago en ceros si aplica.',
        'Despues entra a SIATSE > Tramites disponibles > Solicitud de oportunidad.',
        'Finalmente monitorea la resolucion; suele tardar alrededor de 3 semanas.',
      ];
    case '25':
      return [
        'Primero valida tu ficha tecnica en SIIAU y confirma que la materia ya aparece aprobada.',
        'Despues entra a SIATSE > Tramites disponibles > Aclaracion de estatus.',
        'Finalmente da seguimiento al ajuste en el cambio entre ciclos.',
      ];
    case '26':
      return [
        'Primero espera la publicacion oficial de tu agenda.',
        'Despues entra a SIATSE > Tramites Varios > Aclaracion de tu Agenda.',
        'Finalmente revisa la respuesta en aproximadamente un dia habil.',
      ];
    default: {
      const steps: string[] = [];
      const normalizedLocation = normalizeText(tramite.location);

      if (normalizedLocation.includes('siatse')) {
        steps.push('Primero inicia o captura la solicitud en SIATSE.');
      }
      if (normalizedLocation.includes('control escolar')) {
        steps.push(
          'Despues continua el proceso en Control Escolar (Modulo A, Proulex).',
        );
      } else if (normalizedLocation.includes('archivo')) {
        steps.push(
          'Despues acude a la Ventanilla de Archivo en Modulo A, Proulex.',
        );
      } else if (normalizedLocation.includes('egresados')) {
        steps.push('Despues acude a la ventanilla de Egresados en Modulo A.');
      } else if (normalizedLocation.includes('departamento')) {
        steps.push(
          'Despues acude al departamento correspondiente para autorizacion o revision.',
        );
      }

      if (steps.length === 0) {
        return tramite.requirements.slice(0, 3);
      }

      steps.push(
        'Finalmente revisa el estatus o recoge tu documento segun lo indique el tramite.',
      );
      return steps;
    }
  }
}

function requiresPaymentContext(tramite: TramiteRecord): boolean {
  return !/sin costo/i.test(tramite.cost);
}

function buildAdministrativeSuggestions(
  tramite: TramiteRecord,
  rawMessage: string,
): string[] {
  if (tramite.id === '7') {
    return [
      'Donde recojo la constancia?',
      'Cuanto tarda la constancia?',
      'Como llego a Control Escolar?',
    ];
  }
  if (tramite.id === '23') {
    return [
      'Que hago despues del pago en ceros?',
      'Cuanto tarda la resolucion?',
      'Necesito una licencia',
    ];
  }
  if (tramite.id === '22') {
    return [
      'Que requisitos tiene la licencia?',
      'Que sigue despues de SIATSE?',
      'Cuanto tarda la licencia?',
    ];
  }
  if (tramite.category === 'Revalidación') {
    return [
      'Donde entrego los papeles?',
      'Que documentos necesito?',
      'Como llego a Control Escolar?',
    ];
  }
  if (/donde/.test(normalizeText(rawMessage))) {
    return ['Cuanto cuesta?', 'Que requisitos piden?', 'Abrir guia completa'];
  }
  if (
    normalizeText(tramite.location).includes('siatse') &&
    !normalizeText(tramite.location).includes('control escolar')
  ) {
    return [
      `Que requisitos tiene ${tramite.title}?`,
      'Que sigue despues de SIATSE?',
      `Cuanto tarda ${tramite.title}?`,
    ];
  }
  return [
    `Cuanto cuesta ${tramite.title}?`,
    `Que requisitos piden para ${tramite.title}?`,
    `Donde se hace ${tramite.title}?`,
  ];
}

function clarifyAdministrativeCategory(
  category: TramiteRecord['category'],
  baseContext: AssistantContextState,
): AssistantChatResponse {
  const tramites = TRAMITES_DATA.filter(
    (record) => record.category === category,
  );
  const suggestions = tramites
    .slice(0, 3)
    .map((record) => `Necesito ${record.title}`);
  const clarification = buildClarificationDecision({
    reason: 'ambiguous_subject',
    reply: `Dentro de ${category} hay varios tramites. ¿Cual necesitas exactamente?`,
    suggestions,
    context: withResolvedContext(clearPendingClarification(baseContext), {
      intent: 'administrative',
      entityType: 'tramite_categoria',
      entityLabel: category,
      userGoal: `tramite ${category}`,
    }),
    intent: 'administrative',
    confidence: 0.73,
  });

  return {
    intent: clarification.intent,
    reply: clarification.reply,
    suggestions: clarification.suggestions,
    context: {
      ...clarification.context,
      lastAdministrativeCategory: category,
    },
  };
}

export async function handleAdministrativeIntent(
  rawMessage: string,
  normalizedMessage: string,
  baseContext: AssistantContextState,
  deps: AdministrativeDependencies,
): Promise<AssistantChatResponse> {
  const category = resolveAdministrativeCategory(normalizedMessage);
  const contextTramite = getAdministrativeTramiteFromContext(baseContext);
  const followUpOnPrevious = isAdministrativeFollowUpMessage(
    normalizedMessage,
    baseContext,
  );
  let matchedTramite = resolveBestTramite(normalizedMessage);

  if (
    (!matchedTramite || matchedTramite.score < 80) &&
    followUpOnPrevious &&
    contextTramite
  ) {
    matchedTramite = { record: contextTramite, score: 999 };
  }

  if (
    category &&
    (isBroadAdministrativeCategoryQuery(normalizedMessage, category) ||
      !matchedTramite ||
      matchedTramite.score < 110) &&
    !followUpOnPrevious
  ) {
    return clarifyAdministrativeCategory(category, baseContext);
  }

  if (!matchedTramite) {
    if (followUpOnPrevious && baseContext.lastAdministrativeCategory) {
      const tramites = TRAMITES_DATA.filter(
        (record) => record.category === baseContext.lastAdministrativeCategory,
      );

      return {
        intent: 'administrative',
        reply: buildReply(
          `Dentro de ${baseContext.lastAdministrativeCategory} hay varios tramites.`,
          'Para darte pasos exactos necesito el nombre puntual del tramite.',
        ),
        suggestions: tramites
          .slice(0, 3)
          .map((record) => `Necesito ${record.title}`),
        context: baseContext,
      };
    }

    return {
      intent: 'administrative',
      reply: buildReply(
        'Puedo ayudarte con constancias, revalidacion, articulo 33/34, bajas, IMSS y titulacion.',
        'Si me dices el tramite exacto te doy costo, requisitos, tiempos y donde hacerlo.',
      ),
      suggestions: [
        'Necesito una constancia para beca',
        'Que hago si tengo articulo 33?',
        'Donde entrego la revalidacion?',
      ],
      context: clearPendingClarification(baseContext),
    };
  }

  const tramite = matchedTramite.record;
  const wantsCost = /(cuant|costo|precio|pago|cuesta)/.test(normalizedMessage);
  const wantsLocation = /(donde|ubic|lugar|ventanilla|modulo|entreg)/.test(
    normalizedMessage,
  );
  const wantsRequirements = /(requisit|document|papeles|pasos|necesit)/.test(
    normalizedMessage,
  );
  const wantsTime = /(cuanto tarda|tiempo|dias|respuesta)/.test(
    normalizedMessage,
  );
  const wantsGuide =
    /(necesito|quiero|tramitar|hacer|sacar|como se hace|como lo hago|como lo tramito)/.test(
      normalizedMessage,
    );
  const wantsFlow =
    /(luego|despues|que sigue|paso a paso|proceso|flujo|primero|segundo|a donde voy|donde entrego eso)/.test(
      normalizedMessage,
    );
  const includeFullSummary =
    !wantsCost &&
    !wantsLocation &&
    !wantsRequirements &&
    !wantsTime &&
    !wantsFlow;

  const lines: string[] = [];
  const flowSteps = buildAdministrativeFlow(tramite);
  const normalizedLocation = normalizeText(tramite.location);

  if (/articulo 33/.test(normalizedMessage)) {
    lines.push(
      'Entiendo que el Art. 33 puede ser estresante. Te dejo los pasos claros para que lo resuelvas.',
    );
  } else if (/articulo 34/.test(normalizedMessage)) {
    lines.push(
      'Si ya aprobaste la materia y sigues viendo Art. 34, normalmente se corrige con una aclaracion de estatus.',
    );
  } else {
    lines.push(`Para **${tramite.title}**, esto es lo importante:`);
  }

  if (includeFullSummary || wantsCost)
    lines.push(`- **Costo:** ${tramite.cost}`);
  if (includeFullSummary || wantsTime)
    lines.push(`- **Tiempo:** ${tramite.time}`);
  if (includeFullSummary || wantsLocation)
    lines.push(`- **Lugar:** ${tramite.location}`);

  if (
    (includeFullSummary || wantsLocation) &&
    normalizedLocation.includes('siatse') &&
    !normalizedLocation.includes('control escolar')
  ) {
    lines.push(
      '- **Nota:** este tramite se hace en linea dentro de SIATSE; no requiere ventanilla fisica.',
    );
  }

  if (includeFullSummary || wantsRequirements || wantsGuide) {
    lines.push('- **Requisitos / pasos clave:**');
    tramite.requirements.slice(0, 5).forEach((requirement, index) => {
      lines.push(`  ${index + 1}. ${requirement}`);
    });
  }

  if (includeFullSummary || wantsFlow || wantsGuide) {
    lines.push('- **Ruta recomendada del tramite:**');
    flowSteps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step}`);
    });
  }

  if (requiresPaymentContext(tramite)) {
    lines.push(
      'Recuerda: si el tramite tiene costo, el cargo se refleja en tu orden de pago en SIIAU y **no necesitas llevar ticket fisico** a ventanilla si ya quedo aplicado.',
    );
  }

  lines.push(
    `[Abrir guia completa en Tramites](/tramites?tramite=${tramite.id})`,
  );
  if (tramite.externalUrl) {
    lines.push(`[Descargar formato oficial](${tramite.externalUrl})`);
  }

  const nextBaseContext = withResolvedContext(baseContext, {
    intent: 'administrative',
    entityType: 'tramite',
    entityLabel: tramite.title,
    userGoal: rawMessage,
  });
  const poiMatch = await deps.resolvePoiFromText(
    tramite.location,
    nextBaseContext,
  );
  const nextContext = buildAdministrativeContext(
    nextBaseContext,
    tramite,
    poiMatch?.context,
  );

  return {
    intent: 'administrative',
    reply: buildReply(lines[0] ?? '', lines.slice(1).join('\n')),
    suggestions: buildAdministrativeSuggestions(tramite, rawMessage),
    context: nextContext,
    action: poiMatch?.action,
  };
}
