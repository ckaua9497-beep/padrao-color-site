"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Options = {
  open: boolean;
  onClose: () => void;
  /** Onde o foco fica preso. */
  containerRef: RefObject<HTMLElement | null>;
  /** Quem recebe o foco ao abrir (padrão: o primeiro elemento focável). */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Comportamento de diálogo: foco inicial, Tab preso dentro, Esc fecha, rolagem da página travada
 * e foco devolvido a quem abriu.
 */
export function useModal({ open, onClose, containerRef, initialFocusRef }: Options) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);

    (initialFocusRef?.current ?? focusables()[0] ?? container).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open, containerRef, initialFocusRef]);
}
