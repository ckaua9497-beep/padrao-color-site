"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Mockup3D from "@/components/mockup/Mockup3D";
import type { CaptureFn } from "@/components/mockup/MockupViewer";
import { DEFAULT_ART, type ArtSettings } from "@/components/mockup/art";
import { mockupSpec, type MockupProduct } from "@/lib/mockup";

export type SheetItem = { key: string; product: MockupProduct & { slug: string; image?: string } };

type Shot = { key: string; name: string; slug: string; src: string | null; ms: number };

/** Espera do modelo pronto até a foto: cobre a animação de entrada do visualizador. */
const SETTLE_MS = 1800;
const TIMEOUT_MS = 60000;

/**
 * Folha de contato da QA: passa por cada produto num único visualizador (um contexto WebGL só),
 * fotografa quando o modelo fica pronto e monta a grade de miniaturas para revisar todos os tipos de uma vez.
 */
export default function ContactSheet({ items, text }: { items: SheetItem[]; text: string }) {
  const [index, setIndex] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const captureRef = useRef<CaptureFn | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const current = items[index];
  const art = useMemo<ArtSettings>(() => ({ ...DEFAULT_ART, text }), [text]);
  const spec = useMemo(() => (current ? mockupSpec(current.product, {}) : null), [current]);

  useEffect(() => {
    if (!current || !spec) return;
    const started = performance.now();
    let readyAt = 0;
    const timer = window.setInterval(() => {
      const root = stage.current?.querySelector<HTMLElement>("[data-kind]");
      const ready = root?.dataset.kind === spec.kind && root.dataset.ready === "true";
      const now = performance.now();
      if (ready && !readyAt) readyAt = now;
      const timedOut = now - started > TIMEOUT_MS;
      if ((readyAt && now - readyAt > SETTLE_MS) || timedOut) {
        window.clearInterval(timer);
        let src: string | null = null;
        try {
          src = timedOut ? null : (captureRef.current?.() ?? null);
        } catch {
          src = null;
        }
        setShots((list) => [...list, { key: current.key, name: current.product.name, slug: current.product.slug, src, ms: Math.round(now - started) }]);
        setIndex((i) => i + 1);
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [current, spec]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div ref={stage} className="w-[360px]">
          {current && spec ? <Mockup3D key={current.key} spec={spec} art={art} label={current.product.name} fallbackImage={current.product.image} captureRef={captureRef} className="aspect-square w-full" /> : null}
        </div>
        <p role="status" className="text-sm text-muted" data-qa-done={index >= items.length}>
          {index < items.length ? `Fotografando ${index + 1} de ${items.length}: ${current?.key}` : `Pronto: ${shots.length} mockups (${shots.filter((s) => !s.src).length} falharam)`}
        </p>
      </div>
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 xl:grid-cols-5">
        {shots.map((shot) => (
          <li key={shot.key} className="overflow-hidden rounded-thumb bg-mist">
            {shot.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.src} alt={shot.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center text-micro font-bold text-coral-700">falhou</div>
            )}
            <p className="truncate px-1.5 py-1 text-[11px] font-semibold" title={shot.name}>
              {shot.key}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
