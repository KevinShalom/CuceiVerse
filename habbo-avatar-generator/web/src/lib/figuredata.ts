import fs from "node:fs/promises";

export type Gender = "M" | "F" | "U";

export type SetTypeInfo = {
  type: string;
  paletteId: number | null;
  mandatory: boolean;
};

export type SetInfo = {
  id: number;
  gender: Gender;
  club: number;
  selectable: boolean;
  colorsCount: number; // 1..2 typically
};

export type PaletteColor = {
  id: number;
  index?: number;
  club?: number;
  selectable?: boolean;
  hexCode?: string;
};

type FigureDataCache = {
  raw: any;
  loadedAt: number;
};

const CACHE: { value?: FigureDataCache } = {};

function asArray(maybe: any): any[] {
  if (!maybe) return [];
  if (Array.isArray(maybe)) return maybe;
  if (typeof maybe === "object") return Object.values(maybe);
  return [];
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

function toInt(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeGender(g: any): Gender {
  const s = String(g ?? "U").toUpperCase();
  if (s === "M" || s === "MALE") return "M";
  if (s === "F" || s === "FEMALE") return "F";
  return "U";
}

export async function loadFigureData(): Promise<any> {
  const path = process.env.FIGUREDATA_PATH || "";
  if (!path) {
    throw new Error("FIGUREDATA_PATH no está configurado (env var).");
  }

  const now = Date.now();
  // cache 10 min
  if (CACHE.value && (now - CACHE.value.loadedAt) < 10 * 60 * 1000) {
    return CACHE.value.raw;
  }

  const buf = await fs.readFile(path, "utf-8");
  const raw = JSON.parse(buf);
  CACHE.value = { raw, loadedAt: now };
  return raw;
}

export async function getSetTypes(): Promise<SetTypeInfo[]> {
  const raw = await loadFigureData();

  // Common shapes:
  // raw.settype.settypes[]
  // raw.settypes[]
  // raw.setType[]
  const stRoot =
    pick(raw, ["settype", "setType", "settypes", "setTypes"]) ??
    pick(raw?.figuredata, ["settype", "setType", "settypes", "setTypes"]);

  const settypes = asArray(pick(stRoot, ["settypes", "setTypes", "settype", "setType"]) ?? stRoot);

  const out: SetTypeInfo[] = [];
  for (const st of settypes) {
    const type = String(pick(st, ["type", "id", "name"]) ?? "").trim();
    if (!type) continue;

    const paletteId = pick(st, ["paletteid", "paletteId", "palette"]) != null
      ? toInt(pick(st, ["paletteid", "paletteId", "palette"]))
      : null;

    const mandatory = toBool(pick(st, ["mandatory", "isMandatory"])) || 
                      Object.keys(st).some(k => k.startsWith("mandatory_") && toBool(st[k]));

    out.push({ type, paletteId, mandatory });
  }

  // De-dupe
  const uniq = new Map<string, SetTypeInfo>();
  for (const it of out) {
    if (!uniq.has(it.type)) uniq.set(it.type, it);
  }

  return Array.from(uniq.values()).sort((a, b) => a.type.localeCompare(b.type));
}

export async function getSetsForType(type: string, gender: Gender): Promise<SetInfo[]> {
  const raw = await loadFigureData();

  const stRoot =
    pick(raw, ["settype", "setType", "settypes", "setTypes"]) ??
    pick(raw?.figuredata, ["settype", "setType", "settypes", "setTypes"]);

  const settypes = asArray(pick(stRoot, ["settypes", "setTypes", "settype", "setType"]) ?? stRoot);

  const st = settypes.find((x: any) => String(pick(x, ["type", "id", "name"]) ?? "").trim() === type);
  if (!st) return [];

  const sets = asArray(pick(st, ["sets", "set", "figureparts", "figureParts"]));

  const out: SetInfo[] = [];
  for (const s of sets) {
    const id = toInt(pick(s, ["id", "setid", "setId"]));
    if (!id) continue;

    const g = normalizeGender(pick(s, ["gender", "sex"]));
    if (gender !== "U") {
      if (!(g === "U" || g === gender)) continue;
    }

    const selectable = toBool(pick(s, ["selectable", "isSelectable"])) || toInt(pick(s, ["selectable"])) === 1;
    const club = toInt(pick(s, ["club", "clublevel", "clubLevel"]), 0);

    const parts = asArray(pick(s, ["parts", "part", "figurepart", "figurePart"]));
    const indices = parts
      .map((p: any) => toInt(pick(p, ["colorindex", "colorIndex"]), 0))
      .filter((n: number) => n > 0);
    const colorsCount = Math.max(1, ...indices, 1);

    out.push({ id, gender: g, club, selectable, colorsCount });
  }

  // Prefer selectable
  out.sort((a, b) => (Number(b.selectable) - Number(a.selectable)) || (a.id - b.id));
  return out;
}

export async function getPaletteColors(paletteId: number): Promise<PaletteColor[]> {
  const raw = await loadFigureData();

  // Shapes:
  // raw.palette.palettes[]
  // raw.palettes[]
  const palRoot =
    pick(raw, ["palette", "palettes"]) ??
    pick(raw?.figuredata, ["palette", "palettes"]);

  const palettes = asArray(pick(palRoot, ["palettes", "palette"]) ?? palRoot);

  const pal = palettes.find((p: any) => toInt(pick(p, ["id", "paletteid", "paletteId"])) === paletteId);
  if (!pal) return [];

  const colors = asArray(pick(pal, ["colors", "color", "colours", "colour"]));
  const out: PaletteColor[] = colors
    .map((c: any) => ({
      id: toInt(pick(c, ["id", "colorid", "colorId"]), 0),
      index: pick(c, ["index"]) != null ? toInt(pick(c, ["index"])) : undefined,
      club: pick(c, ["club", "clublevel", "clubLevel"]) != null ? toInt(pick(c, ["club", "clublevel", "clubLevel"])) : undefined,
      selectable: pick(c, ["selectable"]) != null ? toBool(pick(c, ["selectable"])) : undefined,
      hexCode: pick(c, ["hexCode", "hexcode"]) != null ? String(pick(c, ["hexCode", "hexcode"])).trim() : undefined,
    }))
    .filter((c: any) => c.id);

  out.sort((a, b) => (a.index ?? a.id) - (b.index ?? b.id));
  return out;
}
