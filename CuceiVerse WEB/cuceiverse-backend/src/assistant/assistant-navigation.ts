import type { PrismaService } from '../prisma/prisma.service';
import type { PathfindingService } from '../mapa/pathfinding.service';
import type { AssistantChatResponse } from './dto/assistant-chat.dto';
import type {
  AssistantContextState,
  AssistantPoiResolution,
  Poi,
} from './assistant.types';
import { buildClarificationDecision } from './assistant-conversation';
import { buildReply, uniqueSuggestions } from './assistant-replies';
import {
  buildVirtualMapLabel,
  cleanDestinationPrompt,
  clearPendingClarification,
  extractLocationFromMessage,
  normalizeText,
  textSimilarity,
  tokenSimilarityScore,
  TRAMITE_STOPWORDS,
  withResolvedContext,
} from './assistant.utils';

type NavigationDependencies = {
  prisma: PrismaService;
  pathfindingService: PathfindingService;
};

type RankedPoi = {
  poi: Poi;
  score: number;
  exact: boolean;
};

async function loadActivePois(prisma: PrismaService): Promise<Poi[]> {
  return prisma.puntoInteres.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, nearestPathNodeId: true },
    take: 250,
    orderBy: [{ prioridadVisual: 'desc' }, { nombre: 'asc' }],
  });
}

function poiAliases(normalizedName: string): string[] {
  const aliases = new Set<string>();
  aliases.add(normalizedName);

  if (normalizedName.includes('servicio medico')) {
    aliases.add('medico');
    aliases.add('enfermeria');
    aliases.add('servicio medico');
  }
  if (normalizedName.includes('cafeteria')) {
    aliases.add('cafe');
    aliases.add('comida');
    aliases.add('cafeteria cta');
    aliases.add('cta');
    aliases.add('comedor');
  }
  if (normalizedName.includes('control escolar')) {
    aliases.add('escolar');
    aliases.add('control');
    aliases.add('modulo a');
    aliases.add('proulex');
  }
  if (normalizedName.includes('registro escolar')) {
    aliases.add('registro');
    aliases.add('ventanilla');
    aliases.add('escolar');
  }

  const bathroomModule = normalizedName.match(/banos modulo ([a-z0-9]+)/);
  if (bathroomModule?.[1]) {
    aliases.add(`banos del ${bathroomModule[1]}`);
    aliases.add(`bano del ${bathroomModule[1]}`);
    aliases.add(`banos ${bathroomModule[1]}`);
    aliases.add(`bano ${bathroomModule[1]}`);
  }

  const moduleName = normalizedName.match(/^modulo ([a-z0-9]+)/);
  if (moduleName?.[1]) {
    aliases.add(`mod ${moduleName[1]}`);
    aliases.add(`edificio ${moduleName[1]}`);
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

function normalizeNavigationMessage(message: string): string {
  return normalizeText(message)
    .replace(/\bel\s+([a-z0-9])\b/g, 'modulo $1')
    .replace(/\bbanos?\s+del\s+([a-z0-9]+)\b/g, 'banos modulo $1')
    .replace(/\bmod\s+([a-z0-9]+)\b/g, 'modulo $1');
}

function getNavigationTokens(normalizedMessage: string): string[] {
  return normalizedMessage
    .split(' ')
    .filter(
      (token) =>
        (token.length > 2 || /^[a-z0-9]$/i.test(token)) &&
        !TRAMITE_STOPWORDS.has(token),
    );
}

function isShortModuleReference(normalizedMessage: string): boolean {
  return /^(?:estoy en|me encuentro en|ando por|desde|salgo de|voy desde)?\s*modulo\s+[a-z0-9]+\s*$/.test(
    normalizedMessage,
  );
}

function rankPoiCandidates(
  message: string,
  pois: Poi[],
  context: AssistantContextState,
): RankedPoi[] {
  const normalizedMessage = normalizeNavigationMessage(message);

  if (
    /(ahi|alli|ese edificio|ese lugar|muestrame la ruta|cerca de ahi)/.test(
      normalizedMessage,
    )
  ) {
    if (context.lastDestinationPoiId) {
      const byContext = pois.find(
        (poi) => poi.id === context.lastDestinationPoiId,
      );
      if (byContext) {
        return [{ poi: byContext, score: 999, exact: true }];
      }
    }
  }

  const bathroomModuleMatch = normalizedMessage.match(
    /\bbanos?\s+modulo\s+([a-z0-9]+)\b/,
  );
  if (bathroomModuleMatch?.[1]) {
    const moduleKey = bathroomModuleMatch[1];
    const exactBathroom = pois.find((poi) =>
      normalizeText(poi.nombre).includes(`banos modulo ${moduleKey}`),
    );
    if (exactBathroom) {
      return [{ poi: exactBathroom, score: 1000, exact: true }];
    }
  }

  const directModuleMatch = normalizedMessage.match(/\bmodulo\s+([a-z0-9]+)\b/);
  if (directModuleMatch?.[1] && !normalizedMessage.includes('banos')) {
    const moduleKey = directModuleMatch[1];
    const exactModule = pois.find((poi) => {
      const name = normalizeText(poi.nombre);
      return (
        name === `modulo ${moduleKey}` || name.includes(`modulo ${moduleKey} `)
      );
    });
    if (exactModule) {
      return [{ poi: exactModule, score: 1000, exact: true }];
    }
    if (isShortModuleReference(normalizedMessage)) return [];
  }

  const virtualLabel = buildVirtualMapLabel(normalizedMessage);
  if (virtualLabel) {
    const normalizedVirtual = normalizeText(virtualLabel);
    const exactVirtual = pois.find(
      (poi) => normalizeText(poi.nombre) === normalizedVirtual,
    );
    if (exactVirtual) {
      return [{ poi: exactVirtual, score: 1000, exact: true }];
    }
  }

  if (/(biblioteca|library)/.test(normalizedMessage)) {
    const cidInfo = pois.find((poi) =>
      normalizeText(poi.nombre).includes('informacion cid'),
    );
    if (cidInfo) {
      return [{ poi: cidInfo, score: 990, exact: true }];
    }
  }

  const tokens = getNavigationTokens(normalizedMessage);
  return pois
    .map((poi) => {
      const normalizedName = normalizeText(poi.nombre);
      const aliases = poiAliases(normalizedName);
      let score = 0;
      let exact = false;

      if (normalizedName === normalizedMessage) {
        score += 150;
        exact = true;
      }
      if (normalizedName.includes(normalizedMessage)) score += 120;
      if (normalizedMessage.includes(normalizedName)) score += 80;

      for (const token of tokens) {
        if (normalizedName.includes(token)) score += token.length * 3;
      }

      for (const alias of aliases) {
        if (normalizedMessage.includes(alias)) score += 85;
        const aliasSimilarity = Math.max(
          textSimilarity(normalizedMessage, alias),
          tokenSimilarityScore(normalizedMessage, alias),
        );
        if (aliasSimilarity >= 0.78) score += Math.round(aliasSimilarity * 55);
      }

      const nameSimilarity = Math.max(
        textSimilarity(normalizedMessage, normalizedName),
        tokenSimilarityScore(normalizedMessage, normalizedName),
      );
      if (nameSimilarity >= 0.72) score += Math.round(nameSimilarity * 45);

      return { poi, score, exact };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

function resolvePoi(
  message: string,
  pois: Poi[],
  context: AssistantContextState,
): Poi | null {
  const ranked = rankPoiCandidates(message, pois, context);
  if (!ranked[0] || ranked[0].score < 4) return null;
  return ranked[0].poi;
}

function getNavigationFallbackSuggestions(pois: Poi[]): string[] {
  const ranked = pois.slice(0, 6).map((poi) => `Llevame a ${poi.nombre}`);
  return ranked.length > 0
    ? ranked.slice(0, 3)
    : [
        'Llevame a Control Escolar',
        'Llevame a CTA Cafeteria',
        'Llevame al Servicio Medico',
      ];
}

function shouldClarifyDestination(
  message: string,
  ranked: RankedPoi[],
): RankedPoi[] | null {
  if (ranked.length < 2) return null;
  const normalized = normalizeNavigationMessage(message);
  const tokens = getNavigationTokens(normalized);
  const top = ranked[0];
  const nearMatches = ranked
    .filter((item) => item.score >= top.score - 12)
    .slice(0, 3);

  if (top.exact) return null;
  if (nearMatches.length < 2) return null;
  if (
    tokens.length <= 2 ||
    /control|escolar|registro|laboratorio|modulo/.test(normalized)
  ) {
    return nearMatches;
  }

  return null;
}

function buildMissingOriginResponse(
  destination: Poi,
  baseContext: AssistantContextState,
): AssistantChatResponse {
  const nextContext = withResolvedContext(
    {
      ...baseContext,
      pendingDestinationPoiId: destination.id,
      pendingDestinationLabel: destination.nombre,
      lastDestinationPoiId: destination.id,
      lastDestinationLabel: destination.nombre,
    },
    {
      intent: 'navigation',
      entityType: 'destination',
      entityLabel: destination.nombre,
      userGoal: `ruta a ${destination.nombre}`,
    },
  );

  const clarification = buildClarificationDecision({
    reason: 'missing_origin',
    reply: `Puedo llevarte a ${destination.nombre}, pero primero necesito saber donde estas.`,
    suggestions: [
      'Me encuentro en Control Escolar',
      'Estoy en Banos modulo Q',
      'Ando por Cafeteria CTA',
    ],
    context: nextContext,
    intent: 'navigation',
    confidence: 0.82,
  });

  return {
    intent: clarification.intent,
    reply: clarification.reply,
    suggestions: clarification.suggestions,
    context: clarification.context,
  };
}

export async function resolvePoiFromText(
  text: string,
  baseContext: AssistantContextState,
  prisma: PrismaService,
): Promise<AssistantPoiResolution | null> {
  if (
    /plataforma siatse/i.test(text) &&
    !/control escolar|modulo a/i.test(text)
  ) {
    return null;
  }

  const pois = await loadActivePois(prisma);
  const resolved = resolvePoi(text, pois, baseContext);
  if (!resolved) return null;

  return {
    action: {
      type: 'highlight-route',
      destinationPoiId: resolved.id,
      destinationLabel: resolved.nombre,
    },
    context: withResolvedContext(
      {
        ...baseContext,
        lastDestinationPoiId: resolved.id,
        lastDestinationLabel: resolved.nombre,
      },
      {
        intent: 'navigation',
        entityType: 'destination',
        entityLabel: resolved.nombre,
      },
    ),
  };
}

export async function handleNavigationIntent(
  locationName: string,
  baseContext: AssistantContextState,
  deps: NavigationDependencies,
): Promise<AssistantChatResponse> {
  const pois = await loadActivePois(deps.prisma);
  const ranked = rankPoiCandidates(locationName, pois, baseContext);
  const resolved = ranked[0]?.poi ?? null;

  if (!resolved || ranked[0].score < 4) {
    return {
      intent: 'navigation',
      reply: buildReply(
        'No encontre ese destino en el mapa actual.',
        'Prueba con un punto registrado del campus y te guio de inmediato.',
      ),
      suggestions: getNavigationFallbackSuggestions(pois),
      context: clearPendingClarification(baseContext),
    };
  }

  const ambiguous = shouldClarifyDestination(locationName, ranked);
  if (ambiguous) {
    const suggestions = ambiguous.map((item) => item.poi.nombre);
    const clarification = buildClarificationDecision({
      reason: 'ambiguous_destination',
      reply: `Encontre varias opciones parecidas. ¿Te refieres a ${suggestions.join(', o ')}?`,
      suggestions,
      context: withResolvedContext(baseContext, {
        intent: 'navigation',
        entityType: 'destination',
        userGoal: `ruta a ${locationName}`,
      }),
      intent: 'navigation',
      confidence: 0.7,
    });

    return {
      intent: clarification.intent,
      reply: clarification.reply,
      suggestions: clarification.suggestions,
      context: clarification.context,
    };
  }

  const inferredOriginText = extractLocationFromMessage(locationName);
  const explicitOrigin = inferredOriginText
    ? resolvePoi(inferredOriginText, pois, baseContext)
    : null;
  const explicitDestination = inferredOriginText
    ? resolvePoi(cleanDestinationPrompt(locationName), pois, baseContext)
    : resolved;
  const destination = explicitDestination ?? resolved;
  const origin =
    explicitOrigin ??
    (baseContext.lastOriginPoiId
      ? (pois.find((poi) => poi.id === baseContext.lastOriginPoiId) ?? null)
      : null);

  if (!origin && !explicitOrigin) {
    return buildMissingOriginResponse(destination, baseContext);
  }

  if (origin && origin.id === destination.id) {
    return {
      intent: 'navigation',
      reply: buildReply(
        `Ya estas en ${destination.nombre}.`,
        'Si quieres, dime otro destino y te trazo la ruta.',
      ),
      suggestions: [
        'Llevame a Modulo X',
        'Llevame a Control Escolar',
        'Que hay cerca de aqui?',
      ],
      context: withResolvedContext(
        {
          ...baseContext,
          lastOriginPoiId: origin.id,
          lastOriginLabel: origin.nombre,
          lastDestinationPoiId: destination.id,
          lastDestinationLabel: destination.nombre,
          pendingDestinationPoiId: undefined,
          pendingDestinationLabel: undefined,
        },
        {
          intent: 'navigation',
          entityType: 'destination',
          entityLabel: destination.nombre,
          userGoal: `ruta a ${destination.nombre}`,
        },
      ),
    };
  }

  let routeHint = '';
  if (origin && destination && origin.id !== destination.id) {
    try {
      const route = await deps.pathfindingService.calcularRuta(
        origin.id,
        destination.id,
      );
      routeHint = `Distancia estimada: ${Math.round(route.distanciaTotal)} unidades.`;
    } catch {
      routeHint = '';
    }
  }

  return {
    intent: 'navigation',
    reply: buildReply(
      `Te guio de ${origin?.nombre ?? 'tu ubicacion actual'} a ${destination.nombre}.`,
      'Ya prepare la ruta en el mapa.',
      routeHint,
    ),
    suggestions: uniqueSuggestions([
      'Cual es la ruta mas corta?',
      'Que hay cerca de ahi?',
      'Llevame a Control Escolar',
    ]),
    context: withResolvedContext(
      {
        ...baseContext,
        lastOriginPoiId: origin?.id,
        lastOriginLabel: origin?.nombre,
        lastDestinationPoiId: destination.id,
        lastDestinationLabel: destination.nombre,
        pendingDestinationPoiId: undefined,
        pendingDestinationLabel: undefined,
      },
      {
        intent: 'navigation',
        entityType: 'destination',
        entityLabel: destination.nombre,
        userGoal: `ruta a ${destination.nombre}`,
      },
    ),
    action: {
      type: 'highlight-route',
      originPoiId: origin?.id,
      originLabel: origin?.nombre,
      destinationPoiId: destination.id,
      destinationLabel: destination.nombre,
    },
  };
}
