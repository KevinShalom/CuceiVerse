export function polishReply(reply: string): string {
  return reply
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildReply(
  primary: string,
  detail?: string,
  closing?: string,
): string {
  return polishReply([primary, detail, closing].filter(Boolean).join('\n\n'));
}

export function buildClarificationReply(
  question: string,
  hint?: string,
): string {
  return buildReply(question, hint);
}

export function uniqueSuggestions(
  ...groups: Array<string[] | undefined>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}
