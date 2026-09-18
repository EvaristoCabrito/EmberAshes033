/** Live-tweakable per-element parameters. Mutate these directly (e.g. from a debug panel) —
 * the renderer reads them fresh every draw call, so changes apply on the next frame with no
 * extra plumbing. */

export type ElementKind = "fire" | "ice" | "water" | "lightning" | "acid" | "holy" | "darkness" | "shore" | "shore2" | "water2" | "water3" | "water4" | "water5" | "web" | "webShot";

export const ELEMENT_KINDS: readonly ElementKind[] = [
  "fire",
  "ice",
  "water",
  "lightning",
  "acid",
  "holy",
  "darkness",
  "shore",
  "shore2",
  "water2",
  "water3",
  "water4",
  "water5",
  "web",
  "webShot",
];

export const PLACEABLE_ELEMENT_KINDS: readonly PlaceableElementKind[] = ELEMENT_KINDS.filter(
  (k): k is PlaceableElementKind => k !== "web" && k !== "webShot",
);

/** Elemental FX kinds the map editor lets an author manually place as a permanent battle
 * fixture (see ElementalFxPlacement in types.ts) — every ElementKind except the ones driven
 * purely by gameplay: Dreaming Web's floor patch and travelling shot are spawned and despawned
 * by the spell itself (see BattleCanvas's live sync), never hand-placed. */
export type PlaceableElementKind = Exclude<ElementKind, "web" | "webShot">;

export const ELEMENT_LABELS: Record<ElementKind, string> = {
  fire: "Fire",
  ice: "Ice",
  water: "Water",
  lightning: "Lightning",
  acid: "Acid",
  holy: "Holy",
  darkness: "Darkness",
  shore: "Shore 1",
  shore2: "Shore 2",
  water2: "Water 2",
  water3: "Water 3 (Natural Shore)",
  water4: "Water 4 (Rocky Shore)",
  water5: "Water 5 (Bay Shore)",
  web: "Dreaming Web (floor)",
  webShot: "Dreaming Web (shot)",
};

export interface ElementParams {
  /** Tiling scale applied to the shared noise texture's UVs. */
  noiseScale: number;
  /** How fast the noise scrolls / animates, in UV-per-second-ish units. */
  scrollSpeed: number;
  /** Overall opacity / brightness multiplier. */
  intensity: number;
  /** RGB 0..1, the element's tint. */
  color: [number, number, number];
}

export const DEFAULT_ELEMENT_PARAMS: Record<ElementKind, ElementParams> = {
  fire: { noiseScale: 3.2, scrollSpeed: 0.9, intensity: 1.1, color: [1.0, 0.55, 0.12] },
  ice: { noiseScale: 2.4, scrollSpeed: 0.08, intensity: 1.0, color: [0.65, 0.9, 1.0] },
  water: { noiseScale: 2.0, scrollSpeed: 0.35, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  lightning: { noiseScale: 5.0, scrollSpeed: 6.0, intensity: 1.3, color: [0.75, 0.85, 1.0] },
  acid: { noiseScale: 2.6, scrollSpeed: 0.25, intensity: 1.0, color: [0.45, 1.0, 0.2] },
  holy: { noiseScale: 1.6, scrollSpeed: 0.2, intensity: 1.2, color: [1.0, 0.96, 0.75] },
  darkness: { noiseScale: 1.8, scrollSpeed: 0.1, intensity: 1.0, color: [0.15, 0.07, 0.18] },
  // Same values as water, verbatim — shore's wet half is drawn by the exact same
  // waterSurface() call (see shaders.ts), so a Shore hex sitting next to a Water hex has to
  // read as the same body of water, not a different-colored, differently-paced one.
  shore: { noiseScale: 2.0, scrollSpeed: 0.35, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  shore2: { noiseScale: 2.0, scrollSpeed: 0.35, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  water2: { noiseScale: 2.0, scrollSpeed: 0.35, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  // Same color as water across all three natural-shore variants, deliberately — a Water3/4/5
  // hex sitting next to plain Water or a Shore hex has to read as the same body of water, not
  // a differently-tinted one. Only scrollSpeed (how lively/choppy the water reads) and the
  // shoreline shape params (see NATURAL_SHORE_SURFACE in shaders.ts) tell the three apart.
  water3: { noiseScale: 2.0, scrollSpeed: 0.35, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  water4: { noiseScale: 2.0, scrollSpeed: 0.55, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  water5: { noiseScale: 2.0, scrollSpeed: 0.22, intensity: 0.9, color: [0.35, 0.65, 0.85] },
  // Same vivid violet for both — the shot and the patch it leaves behind read as the same magic.
  web: { noiseScale: 3.0, scrollSpeed: 0.5, intensity: 1.0, color: [0.59, 0.23, 0.84] },
  webShot: { noiseScale: 4.0, scrollSpeed: 3.2, intensity: 1.1, color: [0.59, 0.23, 0.84] },
};

/** Mutable live copy — clone so resetting one element never touches the shipped defaults. */
export const EFFECT_PARAMS: Record<ElementKind, ElementParams> = Object.fromEntries(
  ELEMENT_KINDS.map((k) => [k, { ...DEFAULT_ELEMENT_PARAMS[k], color: [...DEFAULT_ELEMENT_PARAMS[k].color] as [number, number, number] }]),
) as Record<ElementKind, ElementParams>;

export function resetElementParams(kind: ElementKind): void {
  EFFECT_PARAMS[kind] = { ...DEFAULT_ELEMENT_PARAMS[kind], color: [...DEFAULT_ELEMENT_PARAMS[kind].color] as [number, number, number] };
}

/** Default footprint (as a multiple of one hex's own tile size) for a placement that doesn't
 * specify radiusTiles. 1.0 lands the effect's hex-shaped silhouette exactly on the tile's own
 * edges (see engine.ts hexPath's `tile * 1.0` for the ground hex itself) — a tile-covering
 * effect like water should match its tile exactly, not spill past it or sit smaller. Elements
 * not listed here (fire's flame, holy's shaft, lightning's bolt, ...) aren't meant to be
 * tile-sized in the first place, so they fall back to the generic default in spawnEffect. */
export const DEFAULT_RADIUS_TILES: Partial<Record<ElementKind, number>> = {
  water: 1.0,
  shore: 1.0,
  shore2: 1.0,
  // Water 2: same water, square instead of hex-shaped and bigger — meant to be dropped over
  // a cluster of Water hexes to paper over any seam between them, not to match one tile.
  water2: 1.7,
  // Water 3/4/5 (natural-shore variants): same footprint as Shore — matches its own hex
  // exactly, half water and half a transparent fringe carved out of that same footprint.
  water3: 1.0,
  water4: 1.0,
  water5: 1.0,
  web: 1.0,
};

/** Non-uniform (width, height) footprint multiplier for a placement that doesn't specify its
 * own aspect. Fire's silhouette fills its whole quad top-to-bottom, so left at the generic
 * square default it comes out noticeably taller than the hex it's standing on. */
export const DEFAULT_ASPECT: Partial<Record<ElementKind, [number, number]>> = {
  fire: [1, 0.6],
};

/** Default rotation (radians) for a placement that doesn't specify its own. */
export const DEFAULT_ROTATION: Partial<Record<ElementKind, number>> = {
  water: Math.PI / 2,
};

/** Global knobs that apply across every element rather than to one of them. */
export const GLOBAL_FX_PARAMS = {
  // LightMapFBO clear value when a light-casting element (fire/acid/holy/darkness) is active
  // (1 = untouched). 0.55 crushed the whole scene to near-half brightness — a mild dip is
  // enough for the light source's glow to read as brighter-than-its-surroundings without
  // making everything else look dim.
  ambientLevel: 0.85,
  bloomThreshold: 0.55,
  bloomStrength: 1.1,
  lightMapScale: 0.5, // LightMapFBO resolution multiplier (spec calls for half-res)
  bloomScale: 0.4,
  /** How much wider a light source's glow spreads than its own visual shape (a flame's light
   * pool reaches further than the flame itself). */
  lightRadiusMul: 2.4,
};
