import type { OfferService } from '../offer/offer.service';
import type { NlpClassificationResult } from './nlp.service';
import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type {
  AssistantContextState,
  AssistantPoiResolver,
} from './assistant.types';
import { buildClarificationDecision } from './assistant-conversation';
import { buildReply, uniqueSuggestions } from './assistant-replies';
import {
  clearPendingClarification,
  getCourseModality,
  getDesiredOfferMode,
  isOfferFollowUpMessage,
  normalizeText,
  textSimilarity,
  tokenSimilarityScore,
  withResolvedContext,
} from './assistant.utils';

type OfferDependencies = {
  offerService: OfferService;
  resolvePoiFromText: AssistantPoiResolver;
};

function extractClarificationOptions(
  materias: Record<string, unknown>[],
  field: 'Materia' | 'Profesor' | 'Edificio',
  label: string,
): string[] {
  const values = new Set<string>();
  for (const materia of materias) {
    const raw = materia[field];
    if (typeof raw !== 'string') continue;
    const value = raw.split('\n')[0]?.trim();
    if (!value) continue;
    values.add(`${label}: ${value}`);
    if (values.size >= 3) break;
  }
  return [...values];
}

function stringifyOfferField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rankOfferFallback(
  query: string,
  materias: Record<string, unknown>[],
): Record<string, unknown>[] {
  return materias
    .map((materia) => {
      const searchable = [
        stringifyOfferField(materia.Materia),
        stringifyOfferField(materia.Profesor),
        stringifyOfferField(materia.Edificio),
      ].join(' ');
      const score = Math.max(
        textSimilarity(query, searchable),
        tokenSimilarityScore(query, searchable),
      );
      return { materia, score };
    })
    .filter((item) => item.score >= 0.58)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.materia);
}

export async function handleOfferSearchIntent(
  nlpResult: NlpClassificationResult,
  rawMessage: string,
  baseContext: AssistantContextState,
  deps: OfferDependencies,
): Promise<AssistantChatResponse> {
  const params: Record<string, string | number> = { limit: 5 };
  const normalizedMessage = normalizeText(rawMessage);
  const desiredMode = getDesiredOfferMode(normalizedMessage);
  const offerFollowUp = isOfferFollowUpMessage(normalizedMessage, baseContext);

  nlpResult.entities.forEach((entity) => {
    if (entity.entity === 'professor') params.profesor = entity.sourceText;
    if (entity.entity === 'building') {
      const rawBuilding = entity.sourceText
        .replace(
          /(en el|al|edificio|modulo|m\u00f3dulo|auditorio|el)(?:\s+de)?/i,
          '',
        )
        .trim();
      params.edificio = rawBuilding;
    }
    if (entity.entity === 'subject') {
      const rawSubject = entity.sourceText
        .replace(/(la clase de|la materia de|clase de|materia de)/i, '')
        .trim();
      params.materia = rawSubject;
    }
    if (entity.entity === 'time') {
      params.hora = entity.sourceText.replace(/(a las|hora)/i, '').trim();
    }
  });

  if (
    !params.profesor &&
    /(profesor|profe)\s+([a-z0-9]+)/.test(normalizedMessage)
  ) {
    params.profesor =
      normalizedMessage.match(
        /(?:profesor|profe)\s+(?:de\s+)?([a-z0-9]+)/,
      )?.[1] ?? '';
  }
  if (
    !params.edificio &&
    /(en el|edificio|modulo|el)\s+([a-z0-9]+)/i.test(normalizedMessage)
  ) {
    params.edificio =
      normalizedMessage.match(/(?:modulo|edificio)\s+([a-z0-9]+)/i)?.[1] ??
      normalizedMessage.match(/(?:en el|el)\s+([a-z0-9]+)/i)?.[1] ??
      '';
  }
  if (!params.hora && /(a las|hora)\s+([0-9:]+)/.test(normalizedMessage)) {
    params.hora =
      normalizedMessage.match(/(?:a las|hora)\s+([0-9:]+)/)?.[1] ?? '';
  }
  if (!params.materia && normalizedMessage.startsWith('materia:')) {
    params.materia = rawMessage.split(':').slice(1).join(':').trim();
  }
  if (!params.profesor && normalizedMessage.startsWith('profesor:')) {
    params.profesor = rawMessage.split(':').slice(1).join(':').trim();
  }
  if (!params.edificio && normalizedMessage.startsWith('edificio:')) {
    params.edificio = rawMessage.split(':').slice(1).join(':').trim();
  }

  if (offerFollowUp) {
    if (!params.materia && baseContext.lastOfferSubject) {
      params.materia = baseContext.lastOfferSubject;
    }
    if (
      !params.profesor &&
      /(ese profe|ese profesor|quien la da|quien la imparte|quien da)/.test(
        normalizedMessage,
      ) &&
      baseContext.lastOfferProfessor
    ) {
      params.profesor = baseContext.lastOfferProfessor;
    }
    if (
      !params.edificio &&
      /(ahi|alli|donde es|donde queda|en que edificio|en donde)/.test(
        normalizedMessage,
      ) &&
      baseContext.lastOfferBuilding
    ) {
      params.edificio = baseContext.lastOfferBuilding;
    }
  }

  if (!params.profesor && !params.edificio && !params.hora && !params.materia) {
    const cleanQuery = normalizedMessage
      .replace(
        /(que clases hay de|clases de|quien da|que profesor|que profe|donde es la materia|donde es|a que hora es|horario de|oferta de|en que edificio es|seccion|buscar materia)/g,
        '',
      )
      .trim();
    if (cleanQuery.length > 3) params.q = cleanQuery;
  }

  if (desiredMode && params.limit === 5) {
    params.limit = 12;
  }

  let { total, materias, error } = await deps.offerService.searchOferta(params);
  let filteredMaterias = desiredMode
    ? materias.filter((item) => {
        const edificio = typeof item.Edificio === 'string' ? item.Edificio : '';
        return getCourseModality(edificio) === desiredMode;
      })
    : materias;

  if (
    !error &&
    filteredMaterias.length === 0 &&
    (params.q || params.materia || params.profesor)
  ) {
    const fallbackQuery = String(params.q ?? params.materia ?? params.profesor);
    const fallback = await deps.offerService.searchOferta({ limit: 50 });
    if (!fallback.error && fallback.materias.length > 0) {
      materias = rankOfferFallback(fallbackQuery, fallback.materias);
      filteredMaterias = desiredMode
        ? materias.filter((item) => {
            const edificio =
              typeof item.Edificio === 'string' ? item.Edificio : '';
            return getCourseModality(edificio) === desiredMode;
          })
        : materias;
      total = filteredMaterias.length;
      error = undefined;
    }
  }

  const effectiveTotal = desiredMode ? filteredMaterias.length : total;

  if (error || !filteredMaterias || filteredMaterias.length === 0) {
    const modalityMessage = desiredMode
      ? ` con modalidad **${desiredMode}**`
      : '';
    return {
      intent: 'academic',
      reply: buildReply(
        `No encontre materias que coincidan con esa busqueda${modalityMessage}.`,
        'Puedes buscar por profesor, materia, edificio o modalidad.',
      ),
      suggestions: [
        'Busca profe Zepeda',
        'Quien da Bases de Datos?',
        'Materias en el Modulo Y',
      ],
      context: clearPendingClarification(baseContext),
    };
  }

  const topMaterias = filteredMaterias.slice(0, 5);
  if (!params.profesor && !params.edificio && !params.hora && !params.materia) {
    const suggestions = uniqueSuggestions(
      extractClarificationOptions(topMaterias, 'Materia', 'Materia'),
      extractClarificationOptions(topMaterias, 'Profesor', 'Profesor'),
    ).slice(0, 3);

    if (effectiveTotal > 1 && suggestions.length >= 2) {
      const clarification = buildClarificationDecision({
        reason: 'ambiguous_subject',
        reply:
          'Tu busqueda coincide con varias opciones. Elige una materia o un profesor para cerrar la consulta.',
        suggestions,
        context: withResolvedContext(clearPendingClarification(baseContext), {
          intent: 'academic',
          entityType: 'offer_query',
          userGoal: rawMessage,
        }),
        intent: 'academic',
        confidence: 0.68,
      });

      return {
        intent: clarification.intent,
        reply: clarification.reply,
        suggestions: clarification.suggestions,
        context: clarification.context,
      };
    }
  }

  const materia = filteredMaterias[0] as Record<string, string>;
  const isMultiple = effectiveTotal > 1;
  const modalidad = getCourseModality(materia.Edificio);
  const nextContext: AssistantContextState = withResolvedContext(
    {
      ...baseContext,
      lastOfferSubject:
        String(materia.Materia ?? params.materia ?? '').trim() || undefined,
      lastOfferProfessor:
        String(materia.Profesor ?? params.profesor ?? '').trim() || undefined,
      lastOfferBuilding:
        String(materia.Edificio ?? params.edificio ?? '')
          .split('\n')[0]
          .trim() || undefined,
      lastOfferMode: modalidad,
    },
    {
      intent: 'academic',
      entityType: 'subject',
      entityLabel: String(materia.Materia ?? '').trim() || undefined,
      userGoal: rawMessage,
    },
  );

  if (params.edificio && !params.materia && !params.profesor && isMultiple) {
    const buildingName = String(params.edificio).toUpperCase();
    const modalityLine = desiredMode ? ` con modalidad **${desiredMode}**` : '';
    const poiAction = await deps.resolvePoiFromText(
      `modulo ${buildingName}`,
      nextContext,
    );

    return {
      intent: 'academic',
      reply: buildReply(
        `Encontre **${effectiveTotal} materias** programadas en el edificio o Modulo **${buildingName}**${modalityLine}.`,
        `[Ver todas las materias en Oferta Academica](/subjects?edificio=${encodeURIComponent(buildingName)})`,
        poiAction
          ? 'Tambien prepare la ruta al edificio en el mapa.'
          : undefined,
      ),
      suggestions: [
        'Busca profe Zepeda',
        'Quien da Bases de Datos?',
        'Que clases hay en el Modulo U?',
      ],
      context: {
        ...(poiAction?.context ?? nextContext),
        lastOfferBuilding: buildingName,
        lastOfferMode: desiredMode ?? nextContext.lastOfferMode,
      },
      action: poiAction?.action,
    };
  }

  let primary = `Encontre la materia **${materia.Materia}**`;
  if (materia.Sec) primary += ` (Sec: ${materia.Sec})`;
  primary += '.';

  const details: string[] = [];
  if (materia.Profesor) details.push(`La imparte ${materia.Profesor}.`);
  if (modalidad === 'virtual') {
    details.push(
      'La modalidad es **virtual**, asi que no requiere un edificio fisico en campus.',
    );
  } else if (modalidad === 'hibrida') {
    details.push('La modalidad es **hibrida**.');
  } else if (materia.Edificio && materia.Aula) {
    details.push(
      `Es en el aula ${materia.Aula} del edificio ${materia.Edificio}.`,
    );
  }
  if (materia.Dias && materia.Hora) {
    details.push(`Dias: ${materia.Dias} a las ${materia.Hora}.`);
  }
  if (desiredMode && modalidad === desiredMode) {
    details.push(`Coincide con la modalidad **${desiredMode}** que pediste.`);
  }
  if (isMultiple) {
    details.push(
      `Hay otras ${effectiveTotal - 1} opcion(es). [Ver detalles en Oferta Academica](/subjects?q=${encodeURIComponent(String(materia.Materia ?? '').trim())})`,
    );
  }

  const response: AssistantChatResponse = {
    intent: 'academic',
    reply: buildReply(primary, details.join(' ')),
    suggestions: [
      'Quien da Bases de Datos?',
      'Materias en el Modulo Y',
      'A que hora es Sistemas Digitales?',
    ],
    context: nextContext,
  };

  if (modalidad !== 'virtual' && materia.Edificio) {
    const edifRaw = String(materia.Edificio)
      .split('\n')[0]
      .trim()
      .toLowerCase();
    let mappedName = edifRaw;
    if (edifRaw.startsWith('mod')) {
      mappedName = `modulo ${edifRaw.replace('mod', '').trim()}`;
    } else if (edifRaw.includes('matute') || edifRaw.includes('aud')) {
      mappedName = 'auditorio matute remus';
    }

    const poiMatch = await deps.resolvePoiFromText(mappedName, nextContext);
    if (poiMatch) {
      response.action = poiMatch.action;
      response.context = poiMatch.context;
      response.reply = buildReply(
        response.reply,
        'Ya prepare el mapa para guiarte a ese edificio.',
      );
    }
  }

  return response;
}
