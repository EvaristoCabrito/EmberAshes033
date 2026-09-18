import { effectiveMaxRange, isProjectile, isRangedWeapon } from "./data.ts";
import type { Point, TerrainId, Unit } from "./types.ts";
import { EMPTY_OVERLAY, effectiveMaxRangeAt, hexDef, type DecorOverlay } from "./hexprops.ts";

export function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function inBounds(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

export function tileAt(tiles: TerrainId[], cols: number, x: number, y: number): TerrainId {
  return tiles[y * cols + x] ?? "plains";
}

export interface Cube {
  q: number;
  r: number;
  s: number;
}

export function oddrToCube(col: number, row: number): Cube {
  const q = col - (row - (row & 1)) / 2;
  const r = row;
  return { q, r, s: -q - r };
}

export function cubeToOddr(q: number, r: number): Point {
  const col = q + (r - (r & 1)) / 2;
  return { x: col, y: r };
}

export function cubeRound(q: number, r: number, s: number): Cube {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return { q: rq, r: rr, s: rs };
}

export function hexLine(a: Point, b: Point): Point[] {
  const n = hexDist(a, b);
  if (n === 0) return [{ x: a.x, y: a.y }];
  const A = oddrToCube(a.x, a.y);
  const B = oddrToCube(b.x, b.y);
  const out: Point[] = [];
  let prev = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = cubeRound(A.q + (B.q - A.q) * t, A.r + (B.r - A.r) * t, A.s + (B.s - A.s) * t);
    const p = cubeToOddr(c.q, c.r);
    const k = key(p.x, p.y);
    if (k === prev) continue;
    prev = k;
    out.push(p);
  }
  return out;
}

export function clearShot(
  from: Point,
  to: Point,
  tiles: TerrainId[],
  cols: number,
  kind: "arrow" | "bolt",
  overlay: DecorOverlay = EMPTY_OVERLAY,
): boolean {
  const fromHigh = !!hexDef(tiles, cols, from.x, from.y, overlay).height;
  const line = hexLine(from, to);
  for (let i = 1; i < line.length; i++) {
    const p = line[i]!;
    const end = i === line.length - 1;
    const t = hexDef(tiles, cols, p.x, p.y, overlay);
    if (t.id === "barricade") {
      if (end) return false;
      const shooterBehind = hexDist(from, p) <= 1;
      const targetBehind = hexDist(to, p) <= 1;
      if (targetBehind) return false;
      if (!shooterBehind) return false;
      continue;
    }
    if (t.blocksShot && !end) return false;
    if (!end && kind === "arrow" && t.height && !fromHigh) return false;
  }
  return true;
}

export function shotKind(unit: { maxRange: number; mag: number }): "arrow" | "bolt" | null {
  if (isRangedWeapon(unit)) return "arrow";
  if (isProjectile(unit)) return "bolt";
  return null;
}

export function hexDist(a: Point, b: Point): number {
  const A = oddrToCube(a.x, a.y);
  const B = oddrToCube(b.x, b.y);
  return (Math.abs(A.q - B.q) + Math.abs(A.r - B.r) + Math.abs(A.s - B.s)) / 2;
}

export function manhattan(a: Point, b: Point): number {
  return hexDist(a, b);
}

export const CUBE_DIRS: Cube[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
];

export function cubeAdd(a: Cube, b: Cube): Cube {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

export function axisDir(from: Point, to: Point): Cube | null {
  const A = oddrToCube(from.x, from.y);
  const B = oddrToCube(to.x, to.y);
  const dq = B.q - A.q;
  const dr = B.r - A.r;
  const ds = B.s - A.s;
  if (dq === 0 && dr === 0 && ds === 0) return null;
  if (dq !== 0 && dr !== 0 && ds !== 0) return null;
  const n = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
  if (n <= 0) return null;
  if (dq % n !== 0 || dr % n !== 0 || ds % n !== 0) return null;
  return { q: dq / n, r: dr / n, s: ds / n };
}

export function hexRay(from: Point, dir: Cube, cols: number, rows: number): Point[] {
  const out: Point[] = [];
  let c = cubeAdd(oddrToCube(from.x, from.y), dir);
  for (let i = 0; i < cols + rows + 4; i++) {
    const p = cubeToOddr(c.q, c.r);
    if (!inBounds(p.x, p.y, cols, rows)) break;
    out.push(p);
    c = cubeAdd(c, dir);
  }
  return out;
}

export function allAxisRays(from: Point, cols: number, rows: number): Point[] {
  const out: Point[] = [];
  for (const d of CUBE_DIRS) out.push(...hexRay(from, d, cols, rows));
  return out;
}

/**
 * Ray from `from` through `through`, continuing straight to the map edge.
 * Unlike `axisDir` this isn't limited to the 6 exact hex axes — it points at
 * `through` from any angle (snapping each step to the nearest hex, same
 * technique as `hexLine`), so any target hex gives a usable line, not just
 * ones perfectly aligned with a hex direction.
 */
export function piercingLine(from: Point, through: Point, cols: number, rows: number): Point[] | null {
  const n = hexDist(from, through);
  if (n <= 0) return null;
  const A = oddrToCube(from.x, from.y);
  const B = oddrToCube(through.x, through.y);
  const stepQ = (B.q - A.q) / n;
  const stepR = (B.r - A.r) / n;
  const stepS = (B.s - A.s) / n;
  const out: Point[] = [];
  let prevKey = "";
  const maxSteps = cols + rows + 4;
  for (let i = 1; i <= maxSteps; i++) {
    const c = cubeRound(A.q + stepQ * i, A.r + stepR * i, A.s + stepS * i);
    const p = cubeToOddr(c.q, c.r);
    const k = key(p.x, p.y);
    if (k === prevKey) continue;
    prevKey = k;
    if (!inBounds(p.x, p.y, cols, rows)) break;
    out.push(p);
  }
  return out.length ? out : null;
}

export function hexNeighbors(col: number, row: number): Point[] {
  const even = [
    [1, 0],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  const odd = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 1],
  ];
  const d = row & 1 ? odd : even;
  return d.map(([dx, dy]) => ({ x: col + dx!, y: row + dy! }));
}

export function cleaveHexes(from: Point, start: Point, count: number, cols: number, rows: number): Point[] {
  const ring = hexNeighbors(from.x, from.y);
  const i = ring.findIndex((p) => p.x === start.x && p.y === start.y);
  if (i < 0) return [];
  const n = Math.max(1, Math.min(6, count));
  const out: Point[] = [];
  for (let k = 0; k < n; k++) {
    const p = ring[(i + k) % ring.length];
    if (p && inBounds(p.x, p.y, cols, rows)) out.push(p);
  }
  return out;
}

export interface ReachCell {
  x: number;
  y: number;
  cost: number;
  parent: string | null;
}

export function unitSize(unit: Pick<Unit, "size">): number {
  return Math.max(1, unit.size || 1);
}

/** The front row of a big creature's footprint — closest to the player, where the feet render (see footprint() below). */
export function footprintFrontRow(
  unit: Point & { footprintOffsets?: { dx: number; dy: number }[] },
  width = 2,
): Point[] {
  if (unit.footprintOffsets) {
    return unit.footprintOffsets.filter((o) => o.dy === 0).map((o) => ({ x: unit.x + o.dx, y: unit.y }));
  }
  const start = unit.x - Math.floor((width - 1) / 2);
  const out: Point[] = [];
  for (let i = 0; i < width; i++) out.push({ x: start + i, y: unit.y });
  return out;
}

export function footprint(
  unit: Pick<Unit, "x" | "y" | "size" | "footprintW" | "footprintH" | "footprintOffsets">,
): Point[] {
  const s = unitSize(unit);
  if (s <= 1) return [{ x: unit.x, y: unit.y }];
  // Explicit shape (any size tier): unit.x/unit.y is the front-most tile (closest to the
  // player, where the feet render); the rest of the shape trails behind it, never past
  // unit.y, so nothing sits hidden behind the sprite from the player's view.
  if (unit.footprintOffsets) {
    return unit.footprintOffsets.map((o) => ({ x: unit.x + o.dx, y: unit.y + o.dy }));
  }
  if (s >= 4) {
    // Fallback: a plain footprintW x footprintH rectangle (default 2x4). Hex rows alternate
    // their horizontal offset every other line (odd-r layout), so every other row here is
    // shifted one column left to keep the column stacking straight instead of zig-zagging.
    const width = unit.footprintW ?? 2;
    const height = unit.footprintH ?? 4;
    const out: Point[] = [];
    for (let dy = 0; dy > -height; dy--) {
      const rowX = dy % 2 !== 0 ? unit.x - 1 : unit.x;
      out.push(...footprintFrontRow({ x: rowX, y: unit.y + dy }, width));
    }
    return out;
  }
  const out: Point[] = [{ x: unit.x, y: unit.y }];
  const want = s <= 2 ? 2 : Math.min(4, s);
  for (const n of hexNeighbors(unit.x, unit.y)) {
    out.push(n);
    if (out.length >= want) break;
  }
  return out;
}

export function occupies(unit: Unit, x: number, y: number): boolean {
  if (!unit.alive) return false;
  return footprint(unit).some((p) => p.x === x && p.y === y);
}

export function occupancy(units: Unit[]): Map<string, Unit> {
  const map = new Map<string, Unit>();
  for (const u of units) {
    if (!u.alive) continue;
    for (const p of footprint(u)) map.set(key(p.x, p.y), u);
  }
  return map;
}

export function unitAt(units: Unit[], x: number, y: number): Unit | undefined {
  return units.find((u) => occupies(u, x, y));
}

export function minRangeTo(ax: number, ay: number, unit: Unit): number {
  let best = 999;
  for (const p of footprint(unit)) {
    const d = hexDist({ x: ax, y: ay }, p);
    if (d < best) best = d;
  }
  return best;
}

export function inRangeOf(ax: number, ay: number, unit: Unit, min: number, max: number): boolean {
  const m = minRangeTo(ax, ay, unit);
  return m >= min && m <= max;
}

function footprintCost(
  x: number,
  y: number,
  size: number,
  tiles: TerrainId[],
  cols: number,
  rows: number,
  occ: Map<string, Unit>,
  self: Unit,
  stop: boolean,
  overlay: DecorOverlay = EMPTY_OVERLAY,
): number | null {
  // self's real shape, not a bare {x,y,size} — that would drop footprintOffsets/footprintW/
  // footprintH entirely (they're not part of this literal), silently falling back to
  // footprint()'s generic 2x4-rectangle default for every size>=4 creature. That default
  // rectangle doesn't match the true silhouette the occupancy map (occ, built from each
  // unit's own real footprint() call) was populated with, so a custom-shaped mover — Troll,
  // Horror, Asherah, Ancient Golem, anything on FOOTPRINT_TYPE_7/8 — was checking the wrong
  // cells for both terrain passability and collision, which reads as "randomly stuck" (some
  // moves wrongly blocked, some real blockers wrongly missed) rather than a clean failure.
  const cells = footprint({ x, y, size, footprintW: self.footprintW, footprintH: self.footprintH, footprintOffsets: self.footprintOffsets });
  let cost = 1;
  for (const p of cells) {
    if (!inBounds(p.x, p.y, cols, rows)) return null;
    const terr = hexDef(tiles, cols, p.x, p.y, overlay);
    if (!terr.passable) {
      if (!(terr.id === "barricade" && self.classId === "troll")) return null;
    }
    const costHere = terr.id === "barricade" && self.classId === "troll" ? 2 : terr.moveCost;
    if (costHere > cost) cost = costHere;
    const who = occ.get(key(p.x, p.y));
    if (!who || who.id === self.id) continue;
    if (who.side !== self.side) return null;
    if (stop) return null;
  }
  return cost;
}

export function computeReachable(
  unit: Unit,
  tiles: TerrainId[],
  cols: number,
  rows: number,
  units: Unit[],
  // Skip the final "can I actually stop here" pass — a cell can be a legal waypoint to walk
  // through (mid-path, another unit standing on it doesn't block passing by) without being a
  // legal place to end movement, so that pass prunes those from the returned map. Pass false
  // only when reconstructing a walk path whose destination is already known-valid by other
  // means (see BattleEngine.commitMove's animation reach): pruning deletes the pass-through
  // cell but leaves any OTHER cell's parent pointer still referencing it, so a path that
  // legitimately routes through one silently truncates at the dangling reference instead of
  // reaching its real destination.
  pruneStopPoints = true,
  overlay: DecorOverlay = EMPTY_OVERLAY,
): Map<string, ReachCell> {
  const occ = occupancy(units);
  const size = unitSize(unit);
  const result = new Map<string, ReachCell>();
  const start: ReachCell = { x: unit.x, y: unit.y, cost: 0, parent: null };
  result.set(key(unit.x, unit.y), start);

  const queue: ReachCell[] = [start];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (cur.cost >= unit.mov) continue;
    for (const n of hexNeighbors(cur.x, cur.y)) {
      const step = footprintCost(n.x, n.y, size, tiles, cols, rows, occ, unit, false, overlay);
      if (step == null) continue;
      const nextCost = cur.cost + step;
      if (nextCost > unit.mov) continue;
      const nk = key(n.x, n.y);
      const prev = result.get(nk);
      if (prev && prev.cost <= nextCost) continue;
      const cell: ReachCell = { x: n.x, y: n.y, cost: nextCost, parent: key(cur.x, cur.y) };
      result.set(nk, cell);
      queue.push(cell);
    }
  }

  if (!pruneStopPoints) return result;
  for (const [k, cell] of result) {
    if (k === key(unit.x, unit.y)) continue;
    if (footprintCost(cell.x, cell.y, size, tiles, cols, rows, occ, unit, true, overlay) == null) {
      result.delete(k);
    }
  }
  return result;
}

/** True path-cost distance from `from` to every tile on the map, ignoring who's standing
 * where and ignoring the mover's own mov stat (ie. a Dijkstra over terrain alone, ceiling
 * cols+rows deep, more than enough for any map this game builds). Used by AI targeting so
 * "which reachable cell gets me closer to the player" is judged by real path distance, not
 * straight-line hex distance — plain hexDist can't see walls/pillars, so an enemy on the far
 * side of an obstacle can end up with every hex-closer cell actually a dead end, greedily
 * "closest by hexDist" then never picks a move at all (every real step reads as moving away)
 * and the enemy freezes in place turn after turn even though a real route exists. */
export function terrainDistanceField(from: Point, tiles: TerrainId[], cols: number, rows: number, overlay: DecorOverlay = EMPTY_OVERLAY): Map<string, number> {
  const dist = new Map<string, number>();
  dist.set(key(from.x, from.y), 0);
  // Bucket queue, not a sorted array. This is a whole-board Dijkstra and the old
  // `queue.sort()` ran once per pop, so the sorting alone was quadratic in the
  // frontier: 75ms for a single 160x160 field against 1.6ms for the same board with
  // buckets. Terrain `moveCost` is a small integer, so a bucket per cost pops in
  // constant time and the result is identical.
  //
  // `buckets[c]` holds cells whose best known cost is c. Costs only ever grow as we
  // walk outward, so visiting buckets in ascending order visits cells in ascending
  // cost — and a cell re-reached cheaper later is re-pushed into an earlier bucket
  // that has not been visited yet. The stale-entry check below drops the older,
  // dearer copy when we get to it.
  const buckets: (Point[] | undefined)[] = [[{ x: from.x, y: from.y }]];
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    if (!bucket) continue;
    for (const cur of bucket) {
      // A cheaper route to this cell was found after it was queued at cost c.
      if ((dist.get(key(cur.x, cur.y)) ?? Infinity) < c) continue;
      for (const n of hexNeighbors(cur.x, cur.y)) {
        if (!inBounds(n.x, n.y, cols, rows)) continue;
        const terr = hexDef(tiles, cols, n.x, n.y, overlay);
        if (!terr.passable) continue;
        const nextCost = c + terr.moveCost;
        const nk = key(n.x, n.y);
        if ((dist.get(nk) ?? Infinity) <= nextCost) continue;
        dist.set(nk, nextCost);
        (buckets[nextCost] ??= []).push({ x: n.x, y: n.y });
      }
    }
    buckets[c] = undefined;
  }
  return dist;
}

export function reconstructPath(reach: Map<string, ReachCell>, to: Point): Point[] {
  const path: Point[] = [];
  let cur: ReachCell | undefined = reach.get(key(to.x, to.y));
  while (cur) {
    path.push({ x: cur.x, y: cur.y });
    cur = cur.parent ? reach.get(cur.parent) : undefined;
  }
  path.reverse();
  return path;
}

export function attackCellsFrom(
  x: number,
  y: number,
  minRange: number,
  maxRange: number,
  cols: number,
  rows: number,
): Point[] {
  const out: Point[] = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const m = hexDist({ x, y }, { x: gx, y: gy });
      if (m >= minRange && m <= maxRange) out.push({ x: gx, y: gy });
    }
  }
  return out;
}

export function inWeaponRange(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  min: number,
  max: number,
): boolean {
  const m = hexDist({ x: ax, y: ay }, { x: bx, y: by });
  return m >= min && m <= max;
}

export function canHitFrom(unit: Unit, from: Point, foe: Unit, tiles: TerrainId[], cols: number, overlay: DecorOverlay = EMPTY_OVERLAY): boolean {
  const placed = { ...unit, x: from.x, y: from.y };
  const tile = tileAt(tiles, cols, from.x, from.y);
  const max = effectiveMaxRange(unit, tile);
  let ok = false;
  for (const p of footprint(placed)) {
    if (inRangeOf(p.x, p.y, foe, unit.minRange, max)) {
      ok = true;
      break;
    }
  }
  if (!ok) return false;
  const kind = shotKind(unit);
  if (!kind) return true;
  return clearShot(from, { x: foe.x, y: foe.y }, tiles, cols, kind, overlay);
}

export function attackableEnemies(
  unit: Unit,
  reach: Map<string, ReachCell>,
  units: Unit[],
  tiles: TerrainId[],
  cols: number,
  overlay: DecorOverlay = EMPTY_OVERLAY,
): Map<string, Point> {
  const best = new Map<string, Point>();
  for (const cell of reach.values()) {
    for (const foe of units) {
      if (!foe.alive || foe.side === unit.side) continue;
      if (!canHitFrom(unit, cell, foe, tiles, cols, overlay)) continue;
      if (!best.has(foe.id)) best.set(foe.id, { x: cell.x, y: cell.y });
    }
  }
  return best;
}

export function computeThreat(
  unit: Unit,
  tiles: TerrainId[],
  cols: number,
  rows: number,
  units: Unit[],
  overlay: DecorOverlay = EMPTY_OVERLAY,
): Point[] {
  const reach = computeReachable(unit, tiles, cols, rows, units, true, overlay);
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const cell of reach.values()) {
    const max = effectiveMaxRangeAt(unit, tiles, cols, cell.x, cell.y, overlay);
    const kind = shotKind(unit);
    for (const p of attackCellsFrom(cell.x, cell.y, unit.minRange, max, cols, rows)) {
      if (kind && !clearShot(cell, p, tiles, cols, kind, overlay)) continue;
      const k = key(p.x, p.y);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
