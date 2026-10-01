"use client";

import { useRef, type ReactNode } from "react";
import { IconClose } from "@/components/icons";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { useModal } from "./useModal";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nome acessível do diálogo. */
  label: string;
  className?: string;
  children: ReactNode;
};

/** Modal centralizado sobre o overlay, com botão de fechar fora do painel (como o preview da Tapz). */
export function Dialog({ open, onClose, label, className, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useModal({ open, onClose, containerRef: root, initialFocusRef: panel });
  if (!open) return null;

  return (
    <div
      ref={root}
      className="fixed inset-0 z-modal flex items-center justify-center bg-overlay p-3 md:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <IconButton label="Fechar" onClick={onClose} className="on-dark absolute right-4 top-4 z-10">
        <IconClose className="size-5" />
      </IconButton>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cx("relative max-h-full w-full overflow-y-auto rounded-panel bg-white outline-none motion-safe:animate-fade-up", className)}
      >
        {children}
      </div>
    </div>
  );
}
