"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Gender, SetInfo, SetTypeInfo, PaletteColor } from "../lib/figuredata";
import { buildFigureString, type FigurePart } from "../lib/figureString";
import { randomAvatar } from "../lib/randomize";

type SetCache = Record<string, SetInfo[]>;
type PaletteCache = Record<number, PaletteColor[]>;

const DEFAULT_TYPES = ["hd", "ch", "lg", "sh", "hr", "ha", "he", "ea", "fa", "cc", "ca", "wa"];

const TYPE_LABELS: Record<string, string> = {
  hd: "Cabeza",
  ch: "Torso",
  lg: "Piernas",
  sh: "Zapatos",
  hr: "Cabello",
  ha: "Sombrero",
  he: "Accesorio cabeza",
  ea: "Ojos",
  fa: "Cara",
  cc: "Chaqueta",
  ca: "Capa",
  wa: "Cintura",
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.toUpperCase();
}

function clubLabel(club: number): string {
  if (club <= 0) return "";
  if (club === 1) return "HC";
  if (club === 2) return "VIP";
  return `CL${club}`;
}

function normalizeHexCode(value?: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^#|0x/i, "").trim();
  if (!/^[0-9a-fA-F]{3,8}$/.test(cleaned)) return null;
  return `#${cleaned}`;
}

function fallbackSwatch(id: number): string {
  const hue = (id * 47) % 360;
  return `hsl(${hue} 65% 70%)`;
}

function normalizeColors(colors: number[], count: number, fallback: number): number[] {
  const next = [...colors];
  while (next.length < count) next.push(fallback);
  return next;
}

function getDefaultColors(set: SetInfo, palette: PaletteColor[]): number[] {
  const fallback = palette[0]?.id ?? 0;
  return Array.from({ length: Math.max(1, set.colorsCount) }, () => fallback);
}

function buildFigureWithOverride(parts: FigurePart[], type: string, setId: number, colors: number[]): string {
  return buildFigureString([...parts, { type, setId, colors }]);
}

function buildRenderUrl(figure: string, opts?: {
  format?: "png" | "gif";
  action?: string;
  gesture?: string;
  direction?: string;
  headDirection?: string;
  size?: "n" | "s";
}): string {
  const sp = new URLSearchParams();
  sp.set("figure", figure);
  sp.set("action", opts?.action ?? "std");
  sp.set("gesture", opts?.gesture ?? "std");
  sp.set("direction", opts?.direction ?? "2");
  sp.set("head_direction", opts?.headDirection ?? "2");
  sp.set("img_format", opts?.format ?? "png");
  sp.set("size", opts?.size ?? "n");
  return `/api/render?${sp.toString()}`;
}

function AvatarGif({
  figure,
  direction,
  previewKey,
  startLoad,
  onLoaded,
}: {
  figure: string;
  direction: number;
  previewKey: number;
  startLoad: boolean;
  onLoaded: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!startLoad) {
      setSrc(null);
      return;
    }
    const url = buildRenderUrl(figure, {
      action: "std",
      direction: direction.toString(),
      headDirection: direction.toString(),
      format: "png",
      size: "n",
    });
    // Add unique per-request salt to bypass ALL caches
    const fullUrl = `${url}&t=${previewKey}&_uid=${Math.random()}`;

    console.log(`[AvatarGif] Loading dir ${direction} for figure:`, figure);

    // Create an image to preload
    const img = new Image();
    img.src = fullUrl;
    img.onload = () => {
      setSrc(fullUrl);
      onLoaded();
    };
    img.onerror = () => {
      onLoaded();
    };
  }, [figure, direction, previewKey, startLoad, onLoaded]);

  return (
    <div className="movementItem">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`walk-${direction}`} />
      ) : (
        <div className="spinner">...</div>
      )}
    </div>
  );
}

function SequentialGrid({ figure, previewKey, onReload, mainImageLoaded }: { figure: string, previewKey: number, onReload: () => void, mainImageLoaded: boolean }) {
  const directions = [2, 4, 0, 6, 1, 3, 5, 7];
  const [loadedCount, setLoadedCount] = useState(0);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Reset loading whenever figure or manual reload key changes
  useEffect(() => {
    // 1. Immediately block loading (clear everything)
    setIsDebouncing(true);
    setLoadedCount(0); // Reset counter

    // 2. Wait 800ms before allowing load to start
    const timer = setTimeout(() => {
      setIsDebouncing(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [figure, previewKey]);

  // Handle start condition based on main image
  useEffect(() => {
    // If not loaded, we stay debouncing/blocked
    if (!mainImageLoaded) {
      setIsDebouncing(true);
      return;
    }
    // Once loaded, we give a small grace period then start
    const timer = setTimeout(() => {
      setIsDebouncing(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [mainImageLoaded]);

  return (
    <div className="movementGridWrapper">
      <div className="movementHeader">
        <div className="smallNote">Vistas previas (secuencial)</div>
        <button className="pillButton" onClick={onReload}>
          Recargar
        </button>
      </div>
      <div className="movementGrid">
        {directions.map((dir, index) => (
          <AvatarGif
            key={`${dir}-${figure}-${previewKey}`}
            figure={figure}
            previewKey={previewKey}
            direction={dir}
            // Start load ONLY if not debouncing AND it's our turn
            startLoad={!isDebouncing && index <= loadedCount}
            onLoaded={() => {
              // Only increment if we are the current one loading
              if (!isDebouncing && index === loadedCount) {
                setLoadedCount(prev => prev + 1);
              }
            }}
          />
        ))}
      </div>
      <div className="smallNote">
        {isDebouncing
          ? (mainImageLoaded ? "Sincronizando..." : "Esperando al avatar...")
          : loadedCount < directions.length
            ? `Cargando ${loadedCount + 1}/${directions.length}...`
            : "Listo"}
      </div>
    </div>
  );
}

export default function Page() {
  const [gender, setGender] = useState<Gender>("M");
  const [setTypes, setSetTypes] = useState<SetTypeInfo[]>([]);
  const [setsByType, setSetsByType] = useState<SetCache>({});
  const [paletteById, setPaletteById] = useState<PaletteCache>({});
  const [parts, setParts] = useState<FigurePart[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeColorSlot, setActiveColorSlot] = useState(0);
  const [showPreviews, setShowPreviews] = useState(true);
  const [showMovementPreviews, setShowMovementPreviews] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [loadingActive, setLoadingActive] = useState(false);
  const [mainImageLoaded, setMainImageLoaded] = useState(false);

  const setTypeMap = useMemo(() => new Map(setTypes.map((s) => [s.type, s])), [setTypes]);
  const figure = useMemo(() => buildFigureString(parts), [parts]);

  const renderUrl = useMemo(() => (
    figure ? `${buildRenderUrl(figure, { size: "n" })}&t=${previewKey}` : ""
  ), [figure, previewKey]);

  const gifUrl = useMemo(() => (
    figure ? `${buildRenderUrl(figure, { format: "gif", action: "wlk", size: "n" })}&t=${previewKey}` : ""
  ), [figure, previewKey]);

  // Sync previewKey with figure changes to ensure main image updates
  // Sync previewKey with figure changes to ensure main image updates
  useEffect(() => {
    setPreviewKey(Date.now());
    setMainImageLoaded(false); // Reset loaded state
  }, [figure]);

  useEffect(() => {
    (async () => {
      const data = await fetchJSON<{ setTypes: SetTypeInfo[] }>("/api/settypes");
      setSetTypes(data.setTypes);
    })().catch(console.error);
  }, []);

  const visibleTypes = useMemo(() => {
    const all = setTypes.map((s) => s.type);
    if (!all.length) return [];

    const base = DEFAULT_TYPES.filter((t) => all.includes(t));
    const mandatory = setTypes
      .filter((s) => s.mandatory)
      .map((s) => s.type)
      .filter((t) => !base.includes(t));

    if (!showAll) return [...mandatory, ...base];

    const extras = all.filter((t) => !mandatory.includes(t) && !base.includes(t));
    return [...mandatory, ...base, ...extras];
  }, [setTypes, showAll]);

  const ensureSets = useCallback(async (type: string): Promise<SetInfo[]> => {
    if (setsByType[type]) return setsByType[type];
    const data = await fetchJSON<{ sets: SetInfo[] }>(`/api/sets?type=${encodeURIComponent(type)}&gender=${gender}`);
    setSetsByType((prev) => ({ ...prev, [type]: data.sets }));
    return data.sets;
  }, [setsByType, gender]);

  const ensurePalette = useCallback(async (paletteId: number | null): Promise<PaletteColor[]> => {
    if (!paletteId) return [];
    if (paletteById[paletteId]) return paletteById[paletteId];
    const data = await fetchJSON<{ colors: PaletteColor[] }>(`/api/palette?id=${paletteId}`);
    setPaletteById((prev) => ({ ...prev, [paletteId]: data.colors }));
    return data.colors;
  }, [paletteById]);

  useEffect(() => {
    if (!visibleTypes.length) {
      setActiveType(null);
      return;
    }
    if (!activeType || !visibleTypes.includes(activeType)) {
      setActiveType(visibleTypes[0]);
    }
  }, [visibleTypes, activeType]);

  const activeSetType = activeType ? (setTypeMap.get(activeType) ?? null) : null;

  useEffect(() => {
    if (!activeType) return;
    let alive = true;
    setLoadingActive(true);
    (async () => {
      await ensureSets(activeType);
      if (activeSetType?.paletteId != null) {
        await ensurePalette(activeSetType.paletteId);
      }
    })()
      .catch(console.error)
      .finally(() => {
        if (alive) setLoadingActive(false);
      });
    return () => {
      alive = false;
    };
  }, [activeType, activeSetType?.paletteId, ensureSets, ensurePalette, gender]);

  useEffect(() => {
    if (!setTypes.length) return;

    (async () => {
      const preload = new Set<string>();
      for (const st of setTypes) if (st.mandatory) preload.add(st.type);
      for (const t of DEFAULT_TYPES) preload.add(t);

      const localSets: SetCache = { ...setsByType };
      const localPal: PaletteCache = { ...paletteById };

      for (const t of preload) {
        const st = setTypeMap.get(t);
        if (!st) continue;
        if (!localSets[t]) localSets[t] = await ensureSets(t);
        if (st.paletteId != null && !localPal[st.paletteId]) localPal[st.paletteId] = await ensurePalette(st.paletteId);
      }

      setParts((prev) => {
        if (prev.length) return prev;
        return randomAvatar({
          gender,
          setTypes,
          setsByType: localSets,
          paletteById: localPal,
          preferredTypes: DEFAULT_TYPES,
        });
      });
    })().catch(console.error);
  }, [setTypes, gender, setTypeMap, ensureSets, ensurePalette, setsByType, paletteById]);



  function updatePart(type: string, patch: Partial<FigurePart>) {
    setParts((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => p.type === type);
      if (idx === -1) {
        next.push({ type, setId: patch.setId ?? 0, colors: patch.colors ?? [0] });
        return next;
      }
      next[idx] = { ...next[idx], ...patch, type };
      return next;
    });
  }

  function removePart(type: string) {
    setParts((prev) => prev.filter((p) => p.type !== type));
  }

  const activeSets = activeType ? (setsByType[activeType] ?? null) : null;
  const selectableSets = useMemo(() => (activeSets ?? []).filter((s) => s.selectable), [activeSets]);
  const activePalette = activeSetType?.paletteId != null ? (paletteById[activeSetType.paletteId] ?? null) : null;
  const paletteSelectable = useMemo(() => (activePalette ?? []).filter((c) => c.selectable !== false), [activePalette]);
  const paletteByIdMap = useMemo(() => new Map(paletteSelectable.map((c) => [c.id, c])), [paletteSelectable]);
  const activePart = activeType ? (parts.find((p) => p.type === activeType) ?? null) : null;
  const currentSet = activePart ? (activeSets ?? []).find((s) => s.id === activePart.setId) ?? null : null;
  const colorsCount = currentSet?.colorsCount ?? 1;
  const defaultColorId = paletteSelectable[0]?.id ?? 0;
  const normalizedColors = normalizeColors(activePart?.colors ?? [], colorsCount, defaultColorId);
  /* 
    OPTIMIZATION: Request Storm Prevention
    We debounce the calculation of the "base parts" used for the item grid previews.
    This ensures that while the user is rapidly clicking or randomizing, we DO NOT 
    request 50+ images from the server. We wait for 1 second of silence.
  */
  const [delayedBaseParts, setDelayedBaseParts] = useState(parts);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update the grid previews if we are idle for 1s
      if (activeType) {
        setDelayedBaseParts(parts.filter((p) => p.type !== activeType));
      } else {
        setDelayedBaseParts(parts);
      }
    }, 3000); // 3 seconds delay for safety
    return () => clearTimeout(timer);
  }, [parts, activeType]);

  // Use the DELAYED parts for the grid to avoid DDOSing ourselves
  // Note: baseParts from before was 'memoized' but immediate. Now we use state.
  const basePartsForGrid = delayedBaseParts;

  useEffect(() => {
    if (colorsCount < 2 && activeColorSlot !== 0) setActiveColorSlot(0);
  }, [colorsCount, activeColorSlot]);

  function handleSelectSet(set: SetInfo) {
    if (!activeType) return;
    const defaults = getDefaultColors(set, paletteSelectable);
    const colors = activePart?.setId === set.id ? normalizeColors(activePart.colors ?? [], set.colorsCount, defaults[0]) : defaults;
    updatePart(activeType, { setId: set.id, colors });
  }

  function handlePickColor(colorId: number) {
    if (!activeType || !activePart?.setId) return;
    const next = normalizeColors(activePart.colors ?? [], colorsCount, defaultColorId);
    next[activeColorSlot] = colorId;
    updatePart(activeType, { colors: next });
  }

  const colorSlots = [normalizedColors[0] ?? defaultColorId, normalizedColors[1] ?? defaultColorId];

  return (
    <div className="container">
      <header className="appHeader">
        <div className="titleBlock">
          <h1>Creador de Avatar</h1>
          <p>Personaliza tu avatar con items, colores y ajustes rapidos.</p>
        </div>
        <div className="headerControls">
          <div className="controlGroup">
            <span className="controlLabel">Genero</span>
            <select
              value={gender}
              onChange={(e) => {
                setGender(e.target.value as Gender);
                setSetsByType({});
                setPaletteById({});
                setParts([]);
              }}
            >
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>

        </div>
      </header>

      <div className="appShell">
        <aside className="panel previewPanel">
          <div>
            <div className="panelTitle">Vista previa</div>
          </div>
          <div className="avatarFrame">
            {figure ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={renderUrl}
                alt="avatar"
                onLoad={() => {
                  console.log("[Page] Main image loaded");
                  setMainImageLoaded(true);
                }}
                onError={() => {
                  // If it fails, we still unblock so the rest can try
                  setMainImageLoaded(true);
                }}
              />
            ) : (
              <div className="avatarHint">Cargando...</div>
            )}
          </div>

          <div className="actionsRow">
            {/* Botones de Abrir PNG/GIF removidos */}
            {/* <div>
              <div className="smallNote">Figure string</div>
              <div className="figureBlock">{figure || "(vacio)"}</div>
            </div> */}
            <div className="row">
              <button
                className={showMovementPreviews ? "primary" : ""}
                onClick={() => setShowMovementPreviews((v) => !v)}
                disabled={!figure}
              >
                {showMovementPreviews ? "Ocultar previa" : "Mostrar previa"}
              </button>
            </div>

            {showMovementPreviews && figure ? (
              <SequentialGrid
                figure={figure}
                previewKey={previewKey}
                onReload={() => setPreviewKey(Date.now())}
                mainImageLoaded={mainImageLoaded}
              />
            ) : null}
          </div>
        </aside>

        <section className="panel builderPanel">
          <div className="builderTop">
            <div>
              <h2>Personalizador</h2>
              <p className="smallNote">Elige categoria, item y colores por pieza.</p>
            </div>
            <div className="toolbar">
              <button className="ghost" onClick={() => setShowPreviews((v) => !v)}>
                {showPreviews ? "Ocultar vistas" : "Mostrar vistas"}
              </button>
            </div>
          </div>

          <div className="builderBody">
            <nav className="categoryRail">
              {visibleTypes.map((type) => (
                <button
                  key={type}
                  className="categoryButton"
                  data-active={type === activeType}
                  aria-pressed={type === activeType}
                  title={typeLabel(type)}
                  onClick={() => setActiveType(type)}
                >
                  <span className="code">{type.toUpperCase()}</span>
                  <span>{typeLabel(type)}</span>
                </button>
              ))}
            </nav>

            <div className="itemsPanel">
              <div className="itemsHeader">
                <div>
                  <div className="row">
                    <span className="typeBadge">{activeType?.toUpperCase() ?? "--"}</span>
                    {activeType ? (
                      <>
                        <span className="typeMeta">{activeSetType?.mandatory ? "obligatorio" : "opcional"}</span>
                        <span className="typeMeta">
                          {selectableSets.length} items
                        </span>
                      </>
                    ) : (
                      <span className="typeMeta">Sin categoria</span>
                    )}
                  </div>
                  <div className="smallNote">{activeType ? typeLabel(activeType) : "Selecciona una categoria"}</div>
                </div>
                {!activeSetType?.mandatory && activeType ? (
                  <button onClick={() => removePart(activeType)}>Quitar</button>
                ) : null}
              </div>

              {loadingActive && !selectableSets.length ? (
                <div className="smallNote">Cargando items...</div>
              ) : null}

              <div className="itemsGrid">
                {!activeSetType?.mandatory && activeType ? (
                  <button
                    className="setTile"
                    data-active={!activePart}
                    onClick={() => removePart(activeType)}
                    title="Ninguno"
                    aria-label="Quitar item"
                  >
                    <div className="tileMedia">
                      <div className="emptyCircle">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </div>
                    </div>
                  </button>
                ) : null}

                {selectableSets.map((set, index) => {
                  const isActive = activePart?.setId === set.id;
                  const colors = isActive ? normalizedColors : getDefaultColors(set, paletteSelectable);
                  const previewFigure = showPreviews && activeType
                    ? buildFigureWithOverride(basePartsForGrid, activeType, set.id, colors)
                    : "";
                  const previewUrl = previewFigure ? buildRenderUrl(previewFigure, { size: "n" }) : "";
                  const club = clubLabel(set.club);
                  const delayStyle = { ["--delay" as any]: `${index * 12}ms` } as React.CSSProperties;

                  return (
                    <button
                      key={set.id}
                      className="setTile"
                      data-active={isActive}
                      onClick={() => handleSelectSet(set)}
                      title={`Set ${set.id}`}
                      aria-label={`Set ${set.id}`}
                      style={delayStyle}
                    >
                      {club ? <span className="tileBadge">{club}</span> : null}
                      <div className="tileMedia">
                        {showPreviews && previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt={`set ${set.id}`} loading="lazy" />
                        ) : (
                          <span className="tilePlaceholder" aria-hidden="true" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="palettePanel">
              <div className="paletteHeader">
                <div className="panelTitle">Colores</div>
                <div className="colorSlots">
                  <button
                    className="colorSlot"
                    data-active={activeColorSlot === 0}
                    onClick={() => setActiveColorSlot(0)}
                    disabled={!activePart?.setId}
                  >
                    <span>Color 1</span>
                    <span
                      className="swatch"
                      style={{
                        background: normalizeHexCode(paletteByIdMap.get(colorSlots[0])?.hexCode ?? "") ?? fallbackSwatch(colorSlots[0]),
                      }}
                    />
                  </button>
                  {colorsCount >= 2 ? (
                    <button
                      className="colorSlot"
                      data-active={activeColorSlot === 1}
                      onClick={() => setActiveColorSlot(1)}
                      disabled={!activePart?.setId}
                    >
                      <span>Color 2</span>
                      <span
                        className="swatch"
                        style={{
                          background: normalizeHexCode(paletteByIdMap.get(colorSlots[1])?.hexCode ?? "") ?? fallbackSwatch(colorSlots[1]),
                        }}
                      />
                    </button>
                  ) : null}
                </div>
              </div>

              {!activePart?.setId ? (
                <div className="smallNote">Selecciona un item para habilitar colores.</div>
              ) : null}

              <div className="paletteGrid">
                {paletteSelectable.map((color) => {
                  const colorHex = normalizeHexCode(color.hexCode ?? "") ?? fallbackSwatch(color.id);
                  const isSelected = normalizedColors[activeColorSlot] === color.id;
                  const style = { ["--swatch-color" as any]: colorHex } as React.CSSProperties;
                  return (
                    <button
                      key={color.id}
                      className="colorSwatch"
                      data-selected={isSelected}
                      onClick={() => handlePickColor(color.id)}
                      title={`Color ${color.id}`}
                      style={style}
                      disabled={!activePart?.setId}
                    />
                  );
                })}
              </div>

              <div className="smallNote">
                Palette: {paletteSelectable.length} colores
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
