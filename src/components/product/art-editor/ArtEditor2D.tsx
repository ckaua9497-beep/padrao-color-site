"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  MIN_LAYER_SCALE,
  clampPlacement,
  dpiQuality,
  loadArtFont,
  maxLayerScale,
  normalizeRotation,
  paintArt,
  readableInk,
  sourceSizeOf,
  withPlacement,
  type ArtFamily,
  type ArtRender,
  type ArtSettings,
  type ArtVariant,
  type LayerInfo,
  type LayerPlacement,
  type PaintInfo,
} from "@/components/mockup/art";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx } from "@/components/ui/cx";
import type { MockupKind } from "@/lib/mockup-kinds";
import { useLoadedImage } from "./useLoadedImage";

export type EditorLayer = "text" | "image";

type Props = {
  /** Arte do lado em edição (frente ou verso). */
  art: ArtSettings;
  onArt: (update: (art: ArtSettings) => ArtSettings) => void;
  kind: MockupKind;
  family: ArtFamily;
  variant: ArtVariant;
  /** Proporção da área de impressão (já com a região do chinelo e os 60% da garrafa térmica). */
  aspect: number;
  /** Medida da área em cm, quando o produto informa. */
  areaCm?: { widthCm: number; heightCm: number } | null;
  /** Cor da peça por baixo de uma estampa sem fundo (tecido). */
  surface?: string;
  ledColors?: string[];
  frontWindow?: number;
  /** false: sem texto de exemplo (verso vazio). */
  sample?: boolean;
  label: string;
  /** "Frente", "Verso"… entra nos rótulos de acessibilidade. */
  sideLabel?: string;
};

type Pt = { x: number; y: number };

type Gesture =
  | { mode: "move" | "scale" | "rotate"; layer: EditorLayer; pointerId: number; origin: LayerPlacement; base: LayerInfo["base"]; start: Pt; center: Pt }
  | { mode: "pinch"; layer: EditorLayer; ids: [number, number]; origin: LayerPlacement; base: LayerInfo["base"]; start: [Pt, Pt] };

/** Distância (px) em que o centro gruda nas guias do meio. */
const SNAP_PX = 7;
/** Giro gruda em 0°, 90°, 180° e 270° (graus). */
const ROTATE_SNAP = 4;
const MAX_STAGE_H = 380;
const MIN_STAGE_H = 72;

const LAYER_NAME: Record<EditorLayer, string> = { text: "Texto", image: "Imagem" };

function formatCm(v: number) {
  return v >= 100 ? `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
}

function angleOf(a: Pt, b: Pt) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function distance(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Giro com ímã nos ângulos retos; com Shift, passos de 15°. */
function snapRotation(deg: number, fine: boolean) {
  if (fine) return Math.round(deg / 15) * 15;
  const right = Math.round(deg / 90) * 90;
  return Math.abs(deg - right) <= ROTATE_SNAP ? right : deg;
}

/**
 * Editor 2D da área de impressão: a mesma pintura do mockup (paintArt) na proporção real da área, com o
 * texto e a imagem como elementos que se arrastam (mouse e toque), mudam de tamanho pelas alças ou pela
 * pinça, giram, grudam nas guias do meio e andam com as setas do teclado. Tudo fica dentro da área e sem
 * distorcer; o 3D acompanha ao vivo (grava art.layout).
 */
export function ArtEditor2D({ art, onArt, kind, family, variant, aspect, areaCm = null, surface, ledColors, frontWindow, sample = true, label, sideLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRefs = useRef<Partial<Record<EditorLayer, HTMLDivElement | null>>>({});
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, Pt>());
  const pendingRef = useRef<{ layer: EditorLayer; placement: LayerPlacement } | null>(null);
  const frameRef = useRef(0);
  const [available, setAvailable] = useState(0);
  const [info, setInfo] = useState<PaintInfo | null>(null);
  const [selected, setSelected] = useState<EditorLayer | null>(null);
  // Posição durante o gesto (a alça acompanha o dedo antes de a pintura nova chegar).
  const [live, setLive] = useState<{ layer: EditorLayer; placement: LayerPlacement; base: LayerInfo["base"] } | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [announcement, setAnnouncement] = useState("");
  const [fontsReady, setFontsReady] = useState("");
  const statusId = useId();
  const image = useLoadedImage(art.src);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? Math.min(40, Math.max(0.05, aspect)) : 1;
  let stageW = available;
  let stageH = stageW / safeAspect;
  if (stageH > MAX_STAGE_H) {
    stageH = MAX_STAGE_H;
    stageW = stageH * safeAspect;
  }
  if (stageH < MIN_STAGE_H && stageW > 0) {
    // Faixas compridas (caneta, régua, cordão): altura mínima e rolagem lateral.
    stageH = MIN_STAGE_H;
    stageW = stageH * safeAspect;
  }
  stageW = Math.round(stageW);
  stageH = Math.round(stageH);

  // Estampa de tecido: imagem sem fundo, como no 3D (o tecido aparece em volta).
  const fabric = family === "apparel";
  const render = useMemo<ArtRender>(
    () => ({
      ...art,
      back: null,
      region: null,
      background: fabric && art.src ? "rgba(0,0,0,0)" : art.background,
      kind,
      ledColors: ledColors?.length ? ledColors : undefined,
      surface,
      frontWindow,
      sample,
    }),
    [art, fabric, kind, ledColors, surface, frontWindow, sample],
  );

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A fonte escolhida chega sob demanda: repinta quando ela termina de carregar.
  const fontKey = `${render.font}|${render.style}|${render.text}|${render.subtext}`;
  useEffect(() => {
    let alive = true;
    loadArtFont(render).then(() => alive && setFontsReady(fontKey));
    return () => {
      alive = false;
    };
  }, [render, fontKey]);

  // Pinta a área (mesmo paintArt do 3D) e guarda onde ficaram texto e imagem.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stageW < 2 || stageH < 2) return;
    const frame = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.max(2, Math.round(stageW * dpr));
      const ch = Math.max(2, Math.round(stageH * dpr));
      if (canvas.width !== cw) canvas.width = cw;
      if (canvas.height !== ch) canvas.height = ch;
      const painted = paintArt(canvas, variant, render, image, label);
      setInfo(painted);
      // Terminado o gesto, a pintura nova já mostra a posição gravada.
      if (!gestureRef.current) {
        setLive((current) => {
          if (!current) return null;
          const layer = painted[current.layer];
          if (!layer) return null;
          const p = layer.placement;
          const caught = Math.abs(p.x - current.placement.x) < 1e-3 && Math.abs(p.y - current.placement.y) < 1e-3 && Math.abs(p.scale - current.placement.scale) < 1e-3;
          // Texto ou imagem mudou (outra caixa): a posição do gesto já não vale.
          const stale = Math.abs(layer.base.w - current.base.w) > 1e-3 || Math.abs(layer.base.h - current.base.h) > 1e-3;
          return caught || stale ? null : current;
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [render, variant, image, label, fontsReady, stageW, stageH]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const layers: EditorLayer[] = [];
  if (info?.image) layers.push("image");
  if (info?.text) layers.push("text");
  const active: EditorLayer | null = selected && layers.includes(selected) ? selected : (layers[0] ?? null);
  const placementOf = (layer: EditorLayer): LayerPlacement | null => (live?.layer === layer ? live.placement : (info?.[layer]?.placement ?? null));
  const activeInfo = active ? (info?.[active] ?? null) : null;
  const activePlacement = active ? placementOf(active) : null;
  const anyFree = Boolean(art.layout?.text || art.layout?.image);
  const textLabel = (art.text.trim() || art.subtext.trim()).slice(0, 40);
  const layerName = (layer: EditorLayer) => (layer === "text" ? `Texto${textLabel ? ` “${textLabel}”` : ""}` : "Imagem");

  // Fundo do palco: noite (neon) ou o tecido (estampa sem fundo); nos demais a pintura cobre a área.
  const neon = variant === "neon";
  const stageColor = neon ? "var(--color-night)" : fabric ? (surface ?? "var(--color-paper)") : "var(--color-mist)";
  const darkStage = neon || (fabric && Boolean(surface) && readableInk(surface ?? "#ffffff") === "#ffffff");

  const describe = (layer: EditorLayer, p: LayerPlacement) =>
    `${layerName(layer)}: ${Math.round(p.x * 100)}% da largura, ${Math.round(p.y * 100)}% da altura, tamanho ${Math.round(p.scale * 100)}%, giro ${Math.round(p.rotation)}°.`;

  /** Grava no próximo quadro (o arraste dispara dezenas de eventos por segundo). */
  const commit = (layer: EditorLayer, placement: LayerPlacement) => {
    pendingRef.current = { layer, placement };
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const next = pendingRef.current;
      pendingRef.current = null;
      if (next) onArt((a) => withPlacement(a, next.layer, next.placement));
    });
  };

  /** Ação pontual (teclado, botões, controles deslizantes): limita à área e grava. */
  const apply = (layer: EditorLayer, next: LayerPlacement) => {
    const base = info?.[layer]?.base;
    if (!base) return;
    const placement = clampPlacement(next, base, safeAspect);
    setLive({ layer, placement, base });
    commit(layer, placement);
    setAnnouncement(describe(layer, placement));
  };

  const pointOf = (event: PointerEvent): Pt => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    const layer = (target.closest<HTMLElement>("[data-layer]")?.dataset.layer as EditorLayer | undefined) ?? null;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
    // Mouse fora dos elementos não faz nada; o toque fora conta para a pinça de dois dedos.
    if (!layer && event.pointerType === "mouse") return;
    const pt = pointOf(event);
    pointersRef.current.set(event.pointerId, pt);
    if (!layer) stageRef.current?.setPointerCapture(event.pointerId);
    const current = gestureRef.current;
    // Segundo dedo: pinça no elemento em edição (tamanho, giro e posição juntos).
    if (pointersRef.current.size === 2 && (current || active)) {
      const pinchLayer = current?.layer ?? active;
      const li = pinchLayer ? info?.[pinchLayer] : null;
      const origin = pinchLayer ? placementOf(pinchLayer) : null;
      if (pinchLayer && li && origin) {
        const ids = [...pointersRef.current.keys()].slice(0, 2) as [number, number];
        const points = ids.map((id) => pointersRef.current.get(id) as Pt) as [Pt, Pt];
        gestureRef.current = { mode: "pinch", layer: pinchLayer, ids, origin, base: li.base, start: points };
        stageRef.current?.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
      return;
    }
    if (!layer || !info?.[layer]) return;
    const origin = placementOf(layer);
    if (!origin) return;
    setSelected(layer);
    layerRefs.current[layer]?.focus({ preventScroll: true });
    const center = { x: origin.x * stageW, y: origin.y * stageH };
    const mode = handle === "scale" ? "scale" : handle === "rotate" ? "rotate" : "move";
    gestureRef.current = { mode, layer, pointerId: event.pointerId, origin, base: info[layer].base, start: pt, center };
    stageRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const pt = pointOf(event);
    pointersRef.current.set(event.pointerId, pt);
    const g = gestureRef.current;
    if (!g || stageW < 2 || stageH < 2) return;
    let next: LayerPlacement;
    let snap = { x: false, y: false };
    if (g.mode === "pinch") {
      const a = pointersRef.current.get(g.ids[0]);
      const b = pointersRef.current.get(g.ids[1]);
      if (!a || !b) return;
      const startMid = { x: (g.start[0].x + g.start[1].x) / 2, y: (g.start[0].y + g.start[1].y) / 2 };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      next = clampPlacement(
        {
          x: g.origin.x + (mid.x - startMid.x) / stageW,
          y: g.origin.y + (mid.y - startMid.y) / stageH,
          scale: g.origin.scale * (distance(a, b) / Math.max(1, distance(g.start[0], g.start[1]))),
          rotation: snapRotation(g.origin.rotation + angleOf(a, b) - angleOf(g.start[0], g.start[1]), false),
        },
        g.base,
        safeAspect,
      );
    } else if (g.pointerId !== event.pointerId) {
      return;
    } else if (g.mode === "move") {
      next = clampPlacement({ ...g.origin, x: g.origin.x + (pt.x - g.start.x) / stageW, y: g.origin.y + (pt.y - g.start.y) / stageH }, g.base, safeAspect);
      snap = { x: Math.abs(next.x - 0.5) * stageW < SNAP_PX, y: Math.abs(next.y - 0.5) * stageH < SNAP_PX };
      if (snap.x || snap.y) next = clampPlacement({ ...next, x: snap.x ? 0.5 : next.x, y: snap.y ? 0.5 : next.y }, g.base, safeAspect);
      snap = { x: snap.x && next.x === 0.5, y: snap.y && next.y === 0.5 };
    } else if (g.mode === "scale") {
      const ratio = distance(g.center, pt) / Math.max(1, distance(g.center, g.start));
      next = clampPlacement({ ...g.origin, scale: g.origin.scale * ratio }, g.base, safeAspect);
    } else {
      const turn = angleOf(g.center, pt) - angleOf(g.center, g.start);
      next = clampPlacement({ ...g.origin, rotation: snapRotation(g.origin.rotation + turn, event.shiftKey) }, g.base, safeAspect);
    }
    setGuides(snap);
    setLive({ layer: g.layer, placement: next, base: g.base });
    commit(g.layer, next);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    const involved = g.mode === "pinch" ? g.ids.includes(event.pointerId) : g.pointerId === event.pointerId;
    if (!involved) return;
    gestureRef.current = null;
    setGuides({ x: false, y: false });
    if (live) setAnnouncement(describe(live.layer, live.placement));
  };

  const onLayerKey = (event: KeyboardEvent<HTMLDivElement>, layer: EditorLayer) => {
    const p = placementOf(layer);
    if (!p) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const turn = event.shiftKey ? 15 : 5;
    const moves: Record<string, LayerPlacement> = {
      ArrowLeft: { ...p, x: p.x - step },
      ArrowRight: { ...p, x: p.x + step },
      ArrowUp: { ...p, y: p.y - step },
      ArrowDown: { ...p, y: p.y + step },
      "+": { ...p, scale: p.scale * 1.05 },
      "=": { ...p, scale: p.scale * 1.05 },
      "-": { ...p, scale: p.scale / 1.05 },
      _: { ...p, scale: p.scale / 1.05 },
      "[": { ...p, rotation: p.rotation - turn },
      "]": { ...p, rotation: p.rotation + turn },
      "{": { ...p, rotation: p.rotation - turn },
      "}": { ...p, rotation: p.rotation + turn },
      c: { ...p, x: 0.5, y: 0.5 },
      C: { ...p, x: 0.5, y: 0.5 },
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    apply(layer, next);
  };

  const resetLayout = () => {
    onArt((a) => ({ ...a, layout: null, fit: "contain", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }));
    setLive(null);
    setAnnouncement("Layout automático restaurado.");
  };

  // Resolução efetiva da imagem na medida em que ela foi colocada.
  const imageInfo = info?.image ?? null;
  const imagePlacement = placementOf("image");
  let dpi: number | null = null;
  if (image && imageInfo && imagePlacement && areaCm && areaCm.widthCm > 0) {
    const pixels = sourceSizeOf(art.src) ?? { w: image.naturalWidth, h: image.naturalHeight };
    const placedCm = imageInfo.base.w * imagePlacement.scale * areaCm.widthCm;
    if (placedCm > 0) dpi = pixels.w / (placedCm / 2.54);
  }
  const quality = dpi === null ? null : dpiQuality(dpi);

  const maxScale = activeInfo && activePlacement ? maxLayerScale(activeInfo.base, activePlacement.rotation, safeAspect) : 1;
  const side = sideLabel ? ` (${sideLabel.toLowerCase()})` : "";

  return (
    <section aria-label={`Posição da arte na peça${side}`} className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold">Posição na peça</p>
        <p className="text-caption text-muted">
          {areaCm ? `Área de impressão: ${formatCm(areaCm.widthCm)} × ${formatCm(areaCm.heightCm)}` : "Área de impressão na proporção da peça"}
        </p>
      </div>

      {/* Faixas compridas rolam de lado; nas demais as alças podem sair do palco. */}
      <div ref={wrapRef} className={cx("-mx-1 px-1", stageW > available + 1 ? "no-scrollbar overflow-x-auto py-11" : "py-8")}>
        {stageW > 0 && (
          <div
            ref={stageRef}
            className={cx("relative mx-auto touch-pan-y select-none rounded-[3px] ring-1", darkStage ? "ring-white/35" : "ring-ink/25")}
            style={{ width: stageW, height: stageH, background: stageColor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full rounded-[3px]" />
            {guides.x && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-coral" />}
            {guides.y && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-coral" />}
            {layers.map((layer) => {
              const li = info?.[layer];
              const p = placementOf(layer);
              if (!li || !p) return null;
              const selectedNow = layer === active;
              return (
                <div
                  key={layer}
                  ref={(node) => {
                    layerRefs.current[layer] = node;
                  }}
                  data-layer={layer}
                  role="group"
                  aria-roledescription="elemento posicionável"
                  aria-label={`${layerName(layer)}. Arraste para mover; setas movem, + e − mudam o tamanho, [ e ] giram, C centraliza.`}
                  aria-describedby={statusId}
                  tabIndex={0}
                  onFocus={() => setSelected(layer)}
                  onKeyDown={(event) => onLayerKey(event, layer)}
                  className={cx(
                    "absolute cursor-move touch-none focus-visible:outline-offset-2",
                    selectedNow
                      ? cx("outline-2 outline-dashed", darkStage ? "outline-white" : "outline-ink")
                      : cx("outline-0 hover:outline-1 hover:outline-dashed", darkStage ? "hover:outline-white/60" : "hover:outline-ink/50"),
                  )}
                  style={{
                    left: p.x * stageW,
                    top: p.y * stageH,
                    width: Math.max(8, li.base.w * p.scale * stageW),
                    height: Math.max(8, li.base.h * p.scale * stageH),
                    transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
                  }}
                >
                  {selectedNow && (
                    <>
                      {(["0% 0%", "100% 0%", "0% 100%", "100% 100%"] as const).map((corner) => {
                        const [left, top] = corner.split(" ");
                        return (
                          <span key={corner} data-handle="scale" aria-hidden className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize place-items-center" style={{ left, top }}>
                            <span className={cx("size-3 rounded-full ring-2", darkStage ? "bg-ink ring-white" : "bg-white ring-ink")} />
                          </span>
                        );
                      })}
                      <span aria-hidden className={cx("pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 -translate-y-full", darkStage ? "bg-white" : "bg-ink")} />
                      <span data-handle="rotate" aria-hidden className="absolute left-1/2 top-0 grid size-8 -translate-x-1/2 -translate-y-[125%] cursor-grab place-items-center">
                        <span className={cx("grid size-4 place-items-center rounded-full ring-2", darkStage ? "bg-ink ring-white" : "bg-white ring-ink")} />
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            {!layers.length && info && (
              <p className={cx("pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-caption font-semibold", darkStage ? "text-white/80" : "text-muted")}>
                Escreva um texto ou envie uma imagem para posicionar{side}.
              </p>
            )}
          </div>
        )}
      </div>

      <p id={statusId} className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {active && activeInfo && activePlacement && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {layers.length > 1 && (
              <SegmentedControl
                label="Elemento em edição"
                value={active}
                onChange={(layer) => setSelected(layer)}
                options={layers.map((layer) => ({ value: layer, label: LAYER_NAME[layer] }))}
              />
            )}
            <Button variant="outline" size="sm" onClick={() => apply(active, { ...activePlacement, x: 0.5, y: 0.5 })}>
              Centralizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => apply(active, { x: 0.5, y: 0.5, rotation: activePlacement.rotation, scale: maxLayerScale(activeInfo.base, activePlacement.rotation, safeAspect) })}
            >
              Ajustar à área
            </Button>
            <Button variant="outline" size="sm" onClick={() => apply(active, { ...activePlacement, rotation: normalizeRotation(Math.round(activePlacement.rotation / 90) * 90 + 90) })}>
              Girar 90°
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label={`Tamanho · ${LAYER_NAME[active].toLowerCase()}`}
              value={activePlacement.scale}
              min={Math.min(MIN_LAYER_SCALE, maxScale)}
              max={maxScale}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(scale) => apply(active, { ...activePlacement, scale })}
            />
            <Range
              label={`Giro · ${LAYER_NAME[active].toLowerCase()}`}
              value={activePlacement.rotation}
              min={-180}
              max={180}
              step={1}
              format={(v) => `${Math.round(v)}°`}
              onChange={(rotation) => apply(active, { ...activePlacement, rotation })}
            />
            <Range
              label={`Horizontal · ${LAYER_NAME[active].toLowerCase()}`}
              value={activePlacement.x}
              min={0}
              max={1}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(x) => apply(active, { ...activePlacement, x })}
            />
            <Range
              label={`Vertical · ${LAYER_NAME[active].toLowerCase()}`}
              value={activePlacement.y}
              min={0}
              max={1}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(y) => apply(active, { ...activePlacement, y })}
            />
          </div>
        </div>
      )}

      {quality && dpi !== null && (
        <p
          role="status"
          className={cx(
            "rounded-control px-3 py-2 text-caption",
            quality === "baixa" ? "bg-coral-50 font-semibold text-coral-700" : quality === "ok" ? "bg-amber-50 text-ink" : "bg-lime-50 text-ink",
          )}
        >
          Resolução da imagem: <strong className="tabular-nums">{Math.round(dpi)} dpi</strong> · {quality}
          {quality === "baixa"
            ? ". A impressão pode sair pixelada: diminua a imagem na área ou envie um arquivo maior."
            : quality === "ok"
              ? ". Boa para a maioria das peças; acima de 300 dpi fica ótima."
              : ". Nitidez de impressão garantida nesse tamanho."}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted">Arraste, use as alças ou dois dedos; a imagem nunca passa da área nem distorce.</p>
        <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={resetLayout} disabled={!anyFree}>
          Voltar ao layout automático
        </Button>
      </div>
    </section>
  );
}

function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold">
        {label}
        <span className="font-normal tabular-nums text-muted">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={Math.max(min + step, max)}
        step={step}
        value={Math.min(Math.max(value, min), Math.max(min + step, max))}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-ink"
      />
    </div>
  );
}
