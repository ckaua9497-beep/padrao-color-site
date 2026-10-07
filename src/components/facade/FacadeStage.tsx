"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/components/ui/cx";
import { CORNER_NAMES, clamp, isConvexQuad, isMirrored, moveQuad, quadCenter, setCorner, type Point, type Quad } from "@/lib/facade";
import { createStageCache, drawLoupe, releaseStageCache, renderStage, type SceneArt } from "./canvas";
import { IconMove } from "./icons";
import { Notice } from "./parts";

/** Canto (0 a 3, a partir do superior esquerdo, no sentido horário) ou a área inteira. */
type Target = number | "move";

type Props = {
  photo: { url: string; width: number; height: number; name: string };
  /** Foto decodificada (null enquanto abre). */
  image: HTMLImageElement | null;
  art: SceneArt;
  /** Marcação em coordenadas 0–1 da foto. */
  quad: Quad;
  onQuad: (quad: Quad) => void;
  /** false = foto original, sem a arte (comparar). */
  showDesign: boolean;
  /** Contorno, cantos e alça de mover. */
  guides: boolean;
};

/** Diâmetro da lupa (px CSS). */
const LOUPE = 124;
/** Passo do teclado em fração da foto; com Shift, 5×. */
const STEP = 0.004;

const percent = (value: number) => `${Math.round(value * 100)}%`;

function describe(quad: Quad, target: Target): string {
  if (target === "move") {
    const center = quadCenter(quad);
    return `Área da fachada movida: centro a ${percent(center.x)} da largura e ${percent(center.y)} da altura da foto.`;
  }
  const p = quad[target];
  return `Canto ${CORNER_NAMES[target]}: ${percent(p.x)} da largura e ${percent(p.y)} da altura da foto.`;
}

/** Lupa acima do dedo (abaixo, perto do topo), sem sair do palco. */
function loupePosition(p: Point, box: { w: number; h: number }) {
  const x = p.x * box.w;
  const y = p.y * box.h;
  const gap = 40;
  const above = y - LOUPE - gap;
  const top = above >= 0 ? above : Math.min(Math.max(0, box.h - LOUPE), y + gap);
  return { left: clamp(x - LOUPE / 2, 0, Math.max(0, box.w - LOUPE)), top };
}

/**
 * Palco do simulador: a foto com a arte em perspectiva (canvas), os quatro cantos arrastáveis
 * (mouse, toque e setas do teclado), a alça para mover a área inteira e a lupa durante o arraste.
 */
export function FacadeStage({ photo, image, art, quad, onQuad, showDesign, guides }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(createStageCache());
  const dragRef = useRef<{ pointerId: number; target: Target; startX: number; startY: number; startQuad: Quad; width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<Target | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [message, setMessage] = useState("");
  const hintId = useId();

  const convex = isConvexQuad(quad);
  const mirrored = convex && isMirrored(quad);
  const cornerDrag = typeof drag === "number" ? drag : null;
  const ratio = photo.width / photo.height;

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) setBox({ w: rect.width, h: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => releaseStageCache(cache);
  }, []);

  // Redesenha no próximo quadro: vários eventos de arraste no mesmo quadro viram um desenho só.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !box) return;
    const frame = requestAnimationFrame(() =>
      renderStage(canvas, cacheRef.current, {
        photo: image,
        photoW: photo.width,
        photoH: photo.height,
        photoKey: photo.url,
        art,
        quad,
        showDesign,
        cssWidth: box.w,
        draft: drag !== null,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [image, box, photo, art, quad, showDesign, drag]);

  useEffect(() => {
    const canvas = loupeRef.current;
    if (cornerDrag === null || !canvas || !image || !box) return;
    drawLoupe(canvas, image, photo.width, photo.height, quad, cornerDrag, box.w, LOUPE);
  }, [cornerDrag, image, photo, quad, box]);

  const startDrag = (event: PointerEvent<HTMLButtonElement>, target: Target) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = { pointerId: event.pointerId, target, startX: event.clientX, startY: event.clientY, startQuad: quad, width: rect.width, height: rect.height };
    setDrag(target);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Deslocamento desde o toque: pegar a alça fora do centro não faz o canto pular.
    const dx = (event.clientX - current.startX) / current.width;
    const dy = (event.clientY - current.startY) / current.height;
    const base = current.startQuad;
    onQuad(current.target === "move" ? moveQuad(base, dx, dy) : setCorner(base, current.target, { x: base[current.target].x + dx, y: base[current.target].y + dy }));
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setMessage(describe(quad, current.target));
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>, target: Target) => {
    const step = event.shiftKey ? STEP * 5 : STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = target === "move" ? moveQuad(quad, delta[0], delta[1]) : setCorner(quad, target, { x: quad[target].x + delta[0], y: quad[target].y + delta[1] });
    onQuad(next);
    setMessage(describe(next, target));
  };

  const center = quadCenter(quad);
  const points = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
  const loupe = cornerDrag !== null && box ? loupePosition(quad[cornerDrag], box) : null;

  return (
    <div>
      <div
        ref={stageRef}
        className="relative mx-auto select-none"
        style={{ aspectRatio: `${photo.width} / ${photo.height}`, width: `min(100%, max(16rem, calc((100svh - 21rem) * ${ratio.toFixed(4)})))` }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={showDesign ? `Simulação da fachada na foto ${photo.name}` : `Foto original: ${photo.name}`}
          className="absolute inset-0 size-full rounded-card bg-mist"
        />
        {!image && <div aria-hidden className="absolute inset-0 animate-pulse rounded-card bg-fog" />}

        {guides && (
          <>
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={points} fill="none" className="stroke-ink/60" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <polygon points={points} fill="none" className={convex ? "stroke-white" : "stroke-coral"} strokeWidth={2} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>

            {convex && (
              <button
                type="button"
                aria-label="Mover a área inteira da fachada"
                aria-describedby={hintId}
                onPointerDown={(event) => startDrag(event, "move")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
                onKeyDown={(event) => nudge(event, "move")}
                className={cx(
                  "absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full bg-ink/75 text-white shadow-float transition-opacity hover:bg-ink",
                  drag === "move" ? "cursor-grabbing" : "cursor-grab",
                  cornerDrag !== null && "opacity-0",
                )}
                style={{ left: `${center.x * 100}%`, top: `${center.y * 100}%` }}
              >
                <IconMove className="size-5" />
              </button>
            )}

            {quad.map((p, i) => (
              <button
                key={CORNER_NAMES[i]}
                type="button"
                aria-label={`Canto ${CORNER_NAMES[i]} da fachada`}
                aria-describedby={hintId}
                onPointerDown={(event) => startDrag(event, i)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
                onKeyDown={(event) => nudge(event, i)}
                className={cx("absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full", drag === i ? "cursor-grabbing" : "cursor-grab")}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span
                  aria-hidden
                  className={cx(
                    "block rounded-full border-2 border-white bg-coral-700 shadow-float transition-[width,height] duration-150",
                    drag === i ? "size-2.5" : "size-5",
                  )}
                />
              </button>
            ))}
          </>
        )}

        {loupe && (
          <canvas
            ref={loupeRef}
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-full shadow-float"
            style={{ left: loupe.left, top: loupe.top, width: LOUPE, height: LOUPE }}
          />
        )}
      </div>

      <p id={hintId} className="mt-3 text-caption text-muted">
        Arraste os quatro cantos até as bordas da fachada; a alça do meio move a área inteira. No teclado: Tab até um canto e setas (Shift + seta anda mais).
      </p>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
      {!convex && (
        <Notice tone="error" role="alert" className="mt-3">
          Os cantos se cruzaram. Arraste-os até formar um quadrilátero, com cada canto no seu lugar.
        </Notice>
      )}
      {mirrored && (
        <Notice tone="warn" role="status" className="mt-3">
          A arte está espelhada: o canto superior esquerdo ficou do lado direito. Troque os cantos de lugar ou use “Recomeçar marcação”.
        </Notice>
      )}
    </div>
  );
}
