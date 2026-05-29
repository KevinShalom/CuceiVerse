import type { Gender, SetInfo, SetTypeInfo, PaletteColor } from "./figuredata";
import type { FigurePart } from "./figureString";

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybe(p: number): boolean {
  return Math.random() < p;
}

export function randomAvatar(params: {
  gender: Gender;
  setTypes: SetTypeInfo[];
  setsByType: Record<string, SetInfo[]>;
  paletteById: Record<number, PaletteColor[]>;
  preferredTypes?: string[];
}): FigurePart[] {
  const { gender, setTypes, setsByType, paletteById } = params;

  const preferred = params.preferredTypes ?? [
    "hd", "ch", "lg", "sh",
    "hr", "ha", "he", "ea", "fa",
    "cc", "ca", "wa",
  ];

  const setTypeMap = new Map(setTypes.map(st => [st.type, st]));
  const result: FigurePart[] = [];

  // Always include mandatory ones if present
  const mandatoryTypes = setTypes.filter(s => s.mandatory).map(s => s.type);
  const base = Array.from(new Set([...mandatoryTypes, ...preferred])).filter(t => setTypeMap.has(t));

  for (const t of base) {
    const st = setTypeMap.get(t)!;
    const sets = (setsByType[t] ?? []).filter(s => s.selectable);
    if (!sets.length) continue;

    // Some optional types are probabilistic
    const isMandatory = st.mandatory || ["hd","ch","lg","sh"].includes(t);
    if (!isMandatory) {
      const prob = (t === "hr" || t === "ha") ? 0.65 : 0.45;
      if (!maybe(prob)) continue;
    }

    const chosen = pickOne(sets);
    const palette = st.paletteId != null ? (paletteById[st.paletteId] ?? []) : [];
    const selectableColors = palette.length ? palette.filter(c => c.selectable !== false) : [];
    const col = selectableColors.length ? pickOne(selectableColors).id : 0;
    const col2 = (chosen.colorsCount >= 2 && selectableColors.length) ? pickOne(selectableColors).id : undefined;

    result.push({
      type: t,
      setId: chosen.id,
      colors: col2 != null ? [col, col2] : [col],
    });
  }

  // Ensure required basics even if not marked mandatory
  for (const t of ["hd","ch","lg","sh"]) {
    if (!result.find(p => p.type === t)) {
      const st = setTypeMap.get(t);
      if (!st) continue;
      const sets = (setsByType[t] ?? []).filter(s => s.selectable);
      if (!sets.length) continue;
      const chosen = pickOne(sets);
      const palette = st.paletteId != null ? (paletteById[st.paletteId] ?? []) : [];
      const selectableColors = palette.length ? palette.filter(c => c.selectable !== false) : [];
      const col = selectableColors.length ? pickOne(selectableColors).id : 0;
      result.push({ type: t, setId: chosen.id, colors: [col] });
    }
  }

  // A couple small tasteful defaults:
  // - Skin tones: hd should not be 0; if 0 pick first color
  const hd = result.find(p => p.type === "hd");
  if (hd && hd.colors[0] === 0) hd.colors[0] = 1;

  return result;
}
