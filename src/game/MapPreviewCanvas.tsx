import { type PointerEvent, useEffect, useRef, useState } from "react";
import { BattleEngine } from "./engine";
import { EffectsRenderer } from "./gfx/EffectsRenderer";
import type { GameArt, Mission } from "./types";

export type PreviewUnitSelection = {
  side: "playerSpawns" | "enemySpawns" | "neutralSpawns";
  index: number;
  name: string;
};

// The technical map is a native scroll surface; keep preview scrollbar travel deliberately gentler.
const PREVIEW_SCROLL_PAN_RATE = 0.45;

/** A read-only window onto the map exactly as the real battle would render it — same tile
 * art, same decoration art, same unit sprites — instead of the paint grid's flat color
 * swatches. Builds a throwaway BattleEngine from the current draft and only ever calls its
 * render(), never tick(): no animation loop, no AI, no turns — just a live snapshot that
 * redraws whenever the mission prop changes (the caller debounces that) or the panel resizes.
 * A left click can use the current editor brush directly; gameplay state remains untouched. */
export function MapPreviewCanvas({ mission, art, onCellClick, selectedDecorationId, selectedPlacedDecoration, onUnitSelect, onUnitPlace }: {
  mission: Mission;
  art: GameArt;
  onCellClick?: (x: number, y: number) => void;
  selectedDecorationId?: string;
  selectedPlacedDecoration?: { id: string; x: number; y: number; rot?: number } | null;
  onUnitSelect?: (unit: PreviewUnitSelection) => void;
  onUnitPlace?: (unit: PreviewUnitSelection, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const unitsCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BattleEngine | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number; armed: boolean; moved: boolean } | null>(null);
  const unitDragRef = useRef<{ pointerId: number; unit: PreviewUnitSelection } | null>(null);
  const cameraRef = useRef<{ x: number; y: number } | null>(null);
  const verticalScrollTopRef = useRef(0);
  const horizontalScrollLeftRef = useRef(0);
  const verticalScrollInitializedRef = useRef(false);
  const armTimerRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isUnitDragging, setIsUnitDragging] = useState(false);
  // Same board size the engine itself renders at (see BattleEngine.boardSize) — the scroll
  // surface only grows past its window when the real board is actually bigger than it.
  const previewTileRadius = zoom < 1.125 ? 34 : zoom < 1.375 ? 50 : 72;
  const previewBoardWidth = Math.ceil(previewTileRadius * Math.sqrt(3) * (mission.cols + 0.5));
  const previewBoardHeight = Math.ceil(previewTileRadius * (1.5 * (mission.rows - 1) + 2));
  // Scrolling only moves the camera at PREVIEW_SCROLL_PAN_RATE of the raw scroll delta (a
  // deliberately gentler feel than the technical grid's native scroll), so the scrollable
  // range has to be inflated by the same factor — otherwise dragging the scrollbar all the
  // way to an edge still pans the camera only a fraction of the way to the board's real edge,
  // and the far side of any map bigger than a couple of screens is simply unreachable.
  const previewScrollWidth = Math.ceil(previewBoardWidth / PREVIEW_SCROLL_PAN_RATE);
  const previewScrollHeight = Math.ceil(previewBoardHeight / PREVIEW_SCROLL_PAN_RATE);
  const unitAt = (x: number, y: number): PreviewUnitSelection | null => {
    const groups = [
      { side: "playerSpawns" as const, units: mission.playerSpawns },
      { side: "enemySpawns" as const, units: mission.enemySpawns },
      { side: "neutralSpawns" as const, units: mission.neutralSpawns ?? [] },
    ];
    for (const group of groups) {
      const index = group.units.findIndex((unit) => unit.x === x && unit.y === y);
      if (index >= 0) return { side: group.side, index, name: group.units[index]!.name };
    }
    return null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // See BattleCanvas for why: units/foreground decorations get their own transparent
    // canvas above the FX layer, so a Water/Fire/etc placement can't paint over them
    // regardless of draw order.
    const unitsCanvas = unitsCanvasRef.current;
    const unitsCtx = unitsCanvas?.getContext("2d") ?? null;

    let engine: BattleEngine;
    try {
      engine = new BattleEngine(mission, art, { hp: {}, levels: {} }, 1);
      // Keep the canvas the size of the window. The BattleEngine owns the real
      // camera, so dragging moves the board rather than an oversized empty canvas.
      engine.setZoom(Math.max(1, Math.min(3, Math.round((zoom - 0.75) * 4))));
      engineRef.current = engine;
    } catch {
      return;
    }
    let needsCameraRestore = cameraRef.current !== null;
    let needsInitialCenter = !needsCameraRestore;

    // Live preview of any elemental FX placed on this map (see the editor's "FX" mode) —
    // same pipeline BattleCanvas uses, spawned once here as persistent instances so the
    // author can see exactly what will play once the mission loads for real.
    let fx: EffectsRenderer | null = null;
    const fxCanvas = fxCanvasRef.current;
    if (fxCanvas) {
      try {
        fx = new EffectsRenderer(fxCanvas);
        for (const p of engine.elementalFxPlacements) fx.spawnEffect(p.kind, p.x, p.y, { radiusTiles: p.radiusTiles, rotation: p.rotation });
      } catch {
        fx = null;
      }
    }
    let lastFrame = performance.now();

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(viewport.clientWidth));
      const h = Math.max(1, Math.floor(viewport.clientHeight));
      if (w <= 0 || h <= 0) return;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (unitsCanvas) {
        unitsCanvas.width = Math.max(1, Math.floor(w * dpr));
        unitsCanvas.height = Math.max(1, Math.floor(h * dpr));
        unitsCanvas.style.width = `${w}px`;
        unitsCanvas.style.height = `${h}px`;
      }
      const drawGroundAndUnits = () => {
        engine.renderGround(ctx, w, h, dpr);
        if (unitsCtx && unitsCanvas) {
          unitsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          unitsCtx.clearRect(0, 0, w, h);
          engine.renderUnitsAndOverlays(unitsCtx, w, h);
        }
      };
      drawGroundAndUnits();
      if (needsCameraRestore) {
        const savedCamera = cameraRef.current;
        if (savedCamera) {
          engine.restoreCamera(savedCamera);
          drawGroundAndUnits();
        }
        needsCameraRestore = false;
      } else if (needsInitialCenter) {
        // First-ever mount for this draft: the draw() above just ran the engine's own
        // first-render focus (a spawn unit, or nowhere at all on a still-empty draft) —
        // override it so the preview always opens on the map's own middle instead of
        // wherever that landed. Only runs once — drawGroundAndUnits() can rerun many times
        // after this (resize, elemental-FX animation frames) and must never re-center over
        // panning the author already did.
        engine.centerOnBoard();
        drawGroundAndUnits();
        needsInitialCenter = false;
      }
      // Drawn on the units canvas (top layer) so the highlight stays visible over units too,
      // matching where it used to land back when everything shared one canvas.
      const highlightCtx = unitsCtx ?? ctx;
      if (selectedPlacedDecoration) engine.drawDecorationHighlight(highlightCtx, selectedPlacedDecoration.id, selectedPlacedDecoration);
      else if (selectedDecorationId) engine.drawDecorationHighlight(highlightCtx, selectedDecorationId);
      if (fx && fxCanvas) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        if (fx.hasEffects()) {
          fxCanvas.style.width = `${w}px`;
          fxCanvas.style.height = `${h}px`;
          fx.resize(w, h, dpr);
          fxCanvas.style.display = "block";
          fx.render(canvas, dt, (col, row) => engine.effectAnchor(col, row));
        } else {
          fxCanvas.style.display = "none";
        }
      }
    };

    redrawRef.current = draw;
    draw();
    // Placements are static in this editor preview (no camera-independent trigger redraws
    // them), so a small self-sustaining loop keeps their animation running; it's a no-op
    // draw() call once fx.hasEffects() goes false, and stops itself right after.
    let fxRaf = 0;
    const animateFx = () => {
      if (!fx?.hasEffects()) return;
      draw();
      fxRaf = requestAnimationFrame(animateFx);
    };
    if (fx?.hasEffects()) fxRaf = requestAnimationFrame(animateFx);
    if (!verticalScrollInitializedRef.current) {
      requestAnimationFrame(() => {
        const centeredTop = Math.round(Math.max(0, viewport.scrollHeight - viewport.clientHeight) / 2);
        const centeredLeft = Math.round(Math.max(0, viewport.scrollWidth - viewport.clientWidth) / 2);
        verticalScrollTopRef.current = centeredTop;
        horizontalScrollLeftRef.current = centeredLeft;
        viewport.scrollTop = centeredTop;
        viewport.scrollLeft = centeredLeft;
        verticalScrollInitializedRef.current = true;
      });
    }
    const ro = new ResizeObserver(draw);
    ro.observe(viewport);
    return () => {
      ro.disconnect();
      if (fxRaf) cancelAnimationFrame(fxRaf);
      fx?.dispose();
      cameraRef.current = engine.cameraPosition();
      if (engineRef.current === engine) engineRef.current = null;
      if (redrawRef.current === draw) redrawRef.current = null;
    };
  }, [mission, art, onCellClick, selectedDecorationId, selectedPlacedDecoration, zoom]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (event.button === 2) {
      event.preventDefault();
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) return;
      const rect = canvas.getBoundingClientRect();
      const cell = engine.cellAt(event.clientX - rect.left, event.clientY - rect.top);
      if (!cell) return;
      const unit = unitAt(cell.x, cell.y);
      if (!unit) return;
      unitDragRef.current = { pointerId: event.pointerId, unit };
      viewport.setPointerCapture(event.pointerId);
      onUnitSelect?.(unit);
      setIsUnitDragging(true);
      return;
    }
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      armed: false,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    armTimerRef.current = window.setTimeout(() => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.armed = true;
      // The hand is the immediate confirmation that the hold-to-pan gesture is ready.
      setIsPanning(true);
    }, 650);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const unitDrag = unitDragRef.current;
    if (unitDrag?.pointerId === event.pointerId) return;
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // The brush owns normal clicks and drags. Pan begins only after the hold
    // timer arms it, then a real movement, so it can never auto-activate.
    if (!drag.moved) {
      const movedFarEnough = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6;
      if (drag.armed && movedFarEnough) {
        drag.moved = true;
      }
    }
    if (drag.moved) {
      engineRef.current?.panBy(-dx, -dy);
      redrawRef.current?.();
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const unitDrag = unitDragRef.current;
    if (unitDrag?.pointerId === event.pointerId) {
      if (!cancelled) {
        const canvas = canvasRef.current;
        const engine = engineRef.current;
        if (canvas && engine) {
          const rect = canvas.getBoundingClientRect();
          const cell = engine.cellAt(event.clientX - rect.left, event.clientY - rect.top);
          if (cell) onUnitPlace?.(unitDrag.unit, cell.x, cell.y);
        }
      }
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      unitDragRef.current = null;
      setIsUnitDragging(false);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    // Normal left click remains the terrain/decorations brush. Panning is still hold + drag.
    if (!cancelled && !drag.moved && event.button === 0) {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (canvas && engine) {
        const rect = canvas.getBoundingClientRect();
        const cell = engine.cellAt(event.clientX - rect.left, event.clientY - rect.top);
        if (cell) onCellClick?.(cell.x, cell.y);
      }
    }
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  };
  const onViewportScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const deltaY = viewport.scrollTop - verticalScrollTopRef.current;
    const deltaX = viewport.scrollLeft - horizontalScrollLeftRef.current;
    verticalScrollTopRef.current = viewport.scrollTop;
    horizontalScrollLeftRef.current = viewport.scrollLeft;
    if (!deltaX && !deltaY) return;
    engineRef.current?.panBy(deltaX * PREVIEW_SCROLL_PAN_RATE, deltaY * PREVIEW_SCROLL_PAN_RATE);
    redrawRef.current?.();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded border border-border bg-surface shadow-md">
        <button
          type="button"
          className="h-7 w-7 text-base text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Diminuir zoom da prévia"
          title="Diminuir zoom"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}
        >
          −
        </button>
        <button
          type="button"
          className="min-w-12 border-x border-border px-1 text-[10px] font-semibold text-fg hover:bg-surface-2"
          aria-label="Restaurar zoom da prévia"
          title="Restaurar zoom"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="h-7 w-7 text-base text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Aumentar zoom da prévia"
          title="Aumentar zoom"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))}
        >
          +
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`h-full w-full bg-black ember-scrollbar overflow-x-auto overflow-y-scroll ${isUnitDragging || isPanning ? "cursor-grabbing" : "cursor-default"}`}
        style={{ scrollbarGutter: "stable both-edges" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, true)}
        onLostPointerCapture={(event) => endDrag(event, true)}
        onContextMenu={(event) => event.preventDefault()}
        onScroll={onViewportScroll}
      >
        <div style={{ width: `max(100%, ${previewScrollWidth}px)`, minHeight: `max(100%, ${previewScrollHeight}px)` }}>
          <div className="sticky left-0 top-0 relative">
            <canvas ref={canvasRef} className="block" />
            <canvas ref={fxCanvasRef} className="pointer-events-none absolute inset-0 block" style={{ display: "none" }} />
            <canvas ref={unitsCanvasRef} className="pointer-events-none absolute inset-0 block" />
          </div>
        </div>
      </div>
    </div>
  );
}
