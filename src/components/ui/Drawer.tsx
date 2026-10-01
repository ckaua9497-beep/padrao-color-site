"use client";

import { useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { useModal } from "./useModal";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nome acessível da gaveta. */
  label: string;
  side?: "left" | "right";
  tone?: "light" | "dark";
  /** Largura no desktop (classe Tailwind); no celular limita a 88% da tela. */
  width?: string;
  className?: string;
  children: ReactNode;
};

/** Gaveta lateral. Fica montada para animar; fechada, é `inert` (fora do Tab e dos leitores de tela). */
export function Drawer({ open, onClose, label, side = "right", tone = "light", width = "w-[460px]", className, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useModal({ open, onClose, containerRef: panel, initialFocusRef: panel });
  const right = side === "right";

  return (
    <div className={cx("fixed inset-0 z-drawer", !open && "pointer-events-none")} inert={!open}>
      <div
        aria-hidden
        onClick={onClose}
        className={cx("absolute inset-0 bg-overlay transition-opacity duration-500", open ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cx(
          "absolute inset-y-0 flex max-w-[88vw] flex-col outline-none transition-transform duration-700 ease-drawer motion-reduce:transition-none",
          right ? "right-0" : "left-0",
          width,
          tone === "dark" ? "on-dark bg-ink text-white" : "bg-white text-ink",
          open ? "translate-x-0" : right ? "translate-x-full" : "-translate-x-full",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
