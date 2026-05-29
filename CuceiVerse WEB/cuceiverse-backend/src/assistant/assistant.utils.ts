import type { AssistantChatDto } from './dto/assistant-chat.dto';
import type { AssistantContextState, DayReference } from './assistant.types';

const DAY_ALIASES: Array<DayReference & { aliases: string[] }> = [
  { label: 'lunes', token: 'L', aliases: ['lunes', 'lun'] },
  { label: 'martes', token: 'M', aliases: ['martes', 'mar'] },
  { label: 'miercoles', token: 'I', aliases: ['miercoles', 'mie'] },
  { label: 'jueves', token: 'J', aliases: ['jueves', 'jue'] },
  { label: 'viernes', token: 'V', aliases: ['viernes', 'vie'] },
  { label: 'sabado', token: 'S', aliases: ['sabado', 'sab'] },
];

const ADMIN_KEYWORDS = [
  'tramite',
  'tramites',
  'constancia',
  'constancias',
  'kardex',
  'revalidacion',
  'equivalencia',
  'acreditacion',
  'licencia',
  'articulo',
  'reingreso',
  'imss',
  'beca',
  'siatse',
  'siatce',
  'titulacion',
  'egresados',
  'control escolar',
  'modulo a',
  'baja voluntaria',
  'agenda',
  'certificada',
  'certificado',
];

export const TRAMITE_STOPWORDS = new Set([
  'como',
  'donde',
  'que',
  'cuanto',
  'cuesta',
  'costo',
  'precio',
  'tramite',
  'tramites',
  'para',
  'por',
  'con',
  'del',
  'de',
  'la',
  'el',
  'los',
  'las',
  'una',
  'uno',
  'un',
  'necesito',
  'quiero',
  'sacar',
  'hacer',
  'tramitar',
  'papeles',
  'documentos',
  'requisitos',
  'pasos',
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

export function textSimilarity(leftRaw: string, rightRaw: string): number {
  const left = normalizeText(leftRaw);
  const right = normalizeText(rightRaw);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;

  const distance = levenshteinDistance(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
}

export function tokenSimilarityScore(
  queryRaw: string,
  targetRaw: string,
): number {
  const queryTokens = normalizeText(queryRaw)
    .split(' ')
    .filter((token) => token.length > 2);
  const targetTokens = normalizeText(targetRaw)
    .split(' ')
    .filter((token) => token.length > 2);

  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  let total = 0;
  for (const queryToken of queryTokens) {
    const best = targetTokens.reduce(
      (score, targetToken) =>
        Math.max(score, textSimilarity(queryToken, targetToken)),
      0,
    );
    total += best;
  }

  return total / queryTokens.length;
}

export function buildAssistantContextState(
  context?: AssistantChatDto['context'],
): AssistantContextState {
  return {
    lastOriginPoiId: context?.lastOriginPoiId,
    lastOriginLabel: context?.lastOriginLabel,
    lastDestinationPoiId: context?.lastDestinationPoiId,
    lastDestinationLabel: context?.lastDestinationLabel,
    pendingDestinationPoiId: context?.pendingDestinationPoiId,
    pendingDestinationLabel: context?.pendingDestinationLabel,
    lastOfferSubject: context?.lastOfferSubject,
    lastOfferProfessor: context?.lastOfferProfessor,
    lastOfferBuilding: context?.lastOfferBuilding,
    lastOfferMode: context?.lastOfferMode,
    lastAdministrativeTramiteId: context?.lastAdministrativeTramiteId,
    lastAdministrativeTramiteTitle: context?.lastAdministrativeTramiteTitle,
    lastAdministrativeCategory: context?.lastAdministrativeCategory,
    lastAdministrativeLocation: context?.lastAdministrativeLocation,
    pendingClarificationType: context?.pendingClarificationType as
      | 'ambiguous_destination'
      | 'ambiguous_subject'
      | 'missing_origin'
      | 'missing_reference'
      | undefined,
    pendingClarificationOptions: context?.pendingClarificationOptions,
    lastResolvedIntent: context?.lastResolvedIntent,
    lastResolvedEntityType: context?.lastResolvedEntityType,
    lastResolvedEntityLabel: context?.lastResolvedEntityLabel,
    lastUserGoal: context?.lastUserGoal,
  };
}

export function clearPendingClarification(
  context: AssistantContextState,
): AssistantContextState {
  return {
    ...context,
    pendingClarificationType: undefined,
    pendingClarificationOptions: undefined,
  };
}

export function withResolvedContext(
  context: AssistantContextState,
  input: {
    intent?: AssistantContextState['lastResolvedIntent'];
    entityType?: AssistantContextState['lastResolvedEntityType'];
    entityLabel?: string;
    userGoal?: string;
  },
): AssistantContextState {
  return {
    ...clearPendingClarification(context),
    lastResolvedIntent: input.intent ?? context.lastResolvedIntent,
    lastResolvedEntityType: input.entityType ?? context.lastResolvedEntityType,
    lastResolvedEntityLabel:
      input.entityLabel ?? context.lastResolvedEntityLabel,
    lastUserGoal: input.userGoal ?? context.lastUserGoal,
  };
}

export function looksLikeTopicChange(normalizedMessage: string): boolean {
  return (
    /(promedio|credito|materia|materias|clases|horario|tramite|constancia|revalidacion|como llego|llevame|ruta|avatar|siiau|mapa)/.test(
      normalizedMessage,
    ) &&
    !/^(ahi|alli|esa|ese|esa materia|ese lugar|desde ahi)$/.test(
      normalizedMessage,
    )
  );
}

export function matchClarificationOption(
  normalizedMessage: string,
  options: string[],
): string | null {
  const normalizedOptions = options.map((option) => ({
    raw: option,
    normalized: normalizeText(option),
  }));

  const exact = normalizedOptions.find(
    (option) =>
      option.normalized === normalizedMessage ||
      normalizedMessage.includes(option.normalized) ||
      option.normalized.includes(normalizedMessage),
  );
  if (exact) return exact.raw;

  if (/^(1|primera?)$/.test(normalizedMessage)) return options[0] ?? null;
  if (/^(2|segunda?)$/.test(normalizedMessage)) return options[1] ?? null;
  if (/^(3|tercera?)$/.test(normalizedMessage)) return options[2] ?? null;

  return null;
}

export function parseStartTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const hit = raw.match(/(\d{3,4})\s*-\s*\d{3,4}/);
  if (!hit?.[1]) return null;
  const padded = hit[1].padStart(4, '0');
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function dayTokenForDate(date: Date): string {
  const day = date.getDay();
  if (day === 0) return 'D';
  if (day === 1) return 'L';
  if (day === 2) return 'M';
  if (day === 3) return 'I';
  if (day === 4) return 'J';
  if (day === 5) return 'V';
  return 'S';
}

export function hasDay(
  dias: string | null | undefined,
  token: string,
): boolean {
  if (!dias) return false;
  return dias.toUpperCase().replace(/\s+/g, '').includes(token);
}

export function extractDayReference(
  normalizedMessage: string,
): DayReference | null {
  if (normalizedMessage.includes('manana')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const token = dayTokenForDate(tomorrow);
    const byToken = DAY_ALIASES.find((entry) => entry.token === token);
    return { token, label: byToken?.label ?? 'manana' };
  }

  if (normalizedMessage.includes('hoy')) {
    const token = dayTokenForDate(new Date());
    const byToken = DAY_ALIASES.find((entry) => entry.token === token);
    return { token, label: byToken?.label ?? 'hoy' };
  }

  return (
    DAY_ALIASES.find((entry) =>
      entry.aliases.some((alias) => normalizedMessage.includes(alias)),
    ) ?? null
  );
}

export function summarizeList(items: string[], limit = 4): string {
  if (items.length === 0) return '';
  if (items.length <= limit) return items.join(', ');
  return `${items.slice(0, limit).join(', ')} y ${items.length - limit} mas`;
}

export function getCourseModality(
  edificio: string | null | undefined,
): 'virtual' | 'hibrida' | 'presencial' | 'desconocida' {
  const normalized = String(edificio ?? '')
    .toUpperCase()
    .trim();
  if (!normalized) return 'desconocida';
  if (!normalized.includes('DESV')) return 'presencial';
  return normalized.length > 7 ? 'hibrida' : 'virtual';
}

export function extractLocationFromMessage(message: string): string | null {
  const normalized = normalizeText(message);
  const patterns = [
    /(?:me encuentro|estoy|ando|vengo|salgo)\s+(?:en|por|desde)\s+(.+)$/,
    /(?:desde|partiendo de)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const raw = match?.[1]
      ?.trim()
      .replace(
        /^(?:me encuentro|estoy|ando|vengo|salgo)\s+(?:en|por|desde)\s+/,
        '',
      );
    if (raw) return raw.replace(/[?.!,]+$/g, '').trim();
  }
  return null;
}

export function cleanDestinationPrompt(message: string): string {
  return normalizeText(message)
    .replace(/^(como)\s+llego\s+(?:a|al|a la)\s+/, '')
    .replace(/^(llevame|guiame|quiero ir)\s+(?:a|al|a la)\s+/, '')
    .replace(
      /\s+(?:desde|partiendo de|me encuentro en|estoy en|ando por|vengo de|salgo de)\s+.+$/g,
      '',
    )
    .replace(/[?.!,]+$/g, '')
    .trim();
}

function capitalizeToken(value: string): string {
  return value.length === 1
    ? value.toUpperCase()
    : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function buildVirtualMapLabel(message: string): string | null {
  const normalized = normalizeText(message)
    .replace(/\bel\s+([a-z0-9])\b/g, 'modulo $1')
    .replace(/\bmod\s+([a-z0-9]+)\b/g, 'modulo $1')
    .replace(/\bbanos?\s+del\s+([a-z0-9]+)\b/g, 'banos modulo $1');

  const bathroomMatch = normalized.match(
    /\bbanos?\s+(?:modulo\s+)?([a-z0-9]+)\b/,
  );
  if (bathroomMatch?.[1]) {
    return `Banos modulo ${capitalizeToken(bathroomMatch[1])}`;
  }

  const moduleMatch = normalized.match(/\bmodulo\s+([a-z0-9]+)\b/);
  if (moduleMatch?.[1]) {
    return `Modulo ${capitalizeToken(moduleMatch[1])}`;
  }

  if (normalized.includes('control escolar')) return 'Control Escolar';
  if (normalized.includes('matute')) return 'Auditorio Matute Remus';
  if (normalized.includes('cid') || normalized.includes('biblioteca')) {
    return 'Modulo de Informacion CID';
  }
  if (normalized.includes('cta') || normalized.includes('cafeteria cta')) {
    return 'CTA Cafeteria';
  }

  return null;
}

export function isOfferFollowUpMessage(
  normalizedMessage: string,
  context: AssistantContextState,
): boolean {
  if (
    !context.lastOfferSubject &&
    !context.lastOfferProfessor &&
    !context.lastOfferBuilding
  ) {
    return false;
  }

  return /(esa|ese|esa materia|ese profe|ese profesor|esa clase|y quien|y donde|y a que hora|es virtual|es presencial|es hibrida|y en que edificio)/.test(
    normalizedMessage,
  );
}

export function getDesiredOfferMode(
  normalizedMessage: string,
): 'virtual' | 'presencial' | 'hibrida' | null {
  if (normalizedMessage.includes('virtual')) return 'virtual';
  if (normalizedMessage.includes('hibrida')) return 'hibrida';
  if (normalizedMessage.includes('presencial')) return 'presencial';
  return null;
}

export function looksLikeNavigationMessage(normalizedMessage: string): boolean {
  if (
    /(materia|materias|clase|clases|profe|profesor|profesora|horario|oferta)/.test(
      normalizedMessage,
    )
  ) {
    return false;
  }

  return /(?:como)\s+llego|llevame|guiame|ruta\s+(?:a|al|para)|traz(?:a|ame)\s+la\s+ruta|muestrame\s+la\s+ruta|ensename\s+el\s+camino|quiero\s+ir\s+a|donde\s+esta|donde\s+queda/.test(
    normalizedMessage,
  );
}

export function isAdministrativeFollowUpMessage(
  normalizedMessage: string,
  context: AssistantContextState,
): boolean {
  if (
    !context.lastAdministrativeTramiteId &&
    !context.lastAdministrativeCategory
  ) {
    return false;
  }

  if (looksLikeNavigationMessage(normalizedMessage)) {
    return false;
  }

  if (
    /(materia|materias|clase|clases|profe|profesor|horario|promedio|creditos|mapa|ruta)/.test(
      normalizedMessage,
    )
  ) {
    return false;
  }

  return /^(y\s+)?(donde|donde entrego|como se hace|como lo hago|como lo tramito|cuanto|cuanto tarda|que necesito|que documentos|que papeles|que requisitos|y luego|despues|despues de eso|primero|segundo|eso|ese tramite|esa solicitud|esa aclaracion|ese proceso|se paga|hay que pagar|abrir guia|guia completa|que sigue)/.test(
    normalizedMessage,
  );
}

export function isAdministrativeMessage(normalizedMessage: string): boolean {
  return ADMIN_KEYWORDS.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return (
      normalizedMessage.includes(normalizedKeyword) ||
      textSimilarity(normalizedMessage, normalizedKeyword) >= 0.74 ||
      tokenSimilarityScore(normalizedMessage, normalizedKeyword) >= 0.82
    );
  });
}

export function looksLikeAcademicSearchMessage(
  normalizedMessage: string,
): boolean {
  if (
    /(mis materias|materias curso|materias estoy cursando|curso este semestre|inscritas|clases tengo|tengo el|promedio|credito|creditos|siguiente clase|primera clase)/.test(
      normalizedMessage,
    )
  ) {
    return false;
  }

  return /(materia|materias|clase|clases|profe|profesor|profesora|oferta|bases|calculo|programacion|datos)/.test(
    normalizedMessage,
  );
}
