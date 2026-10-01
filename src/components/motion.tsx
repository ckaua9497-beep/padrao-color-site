"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type TextTag = "div" | "section" | "article" | "li" | "h1" | "h2" | "h3" | "p";

export function useInView<T extends Element>(threshold = 0.2, rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, threshold, rootMargin]);
  return [ref, shown] as const;
}

export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
  side = false,
}: {
  children: ReactNode;
  as?: TextTag;
  className?: string;
  delay?: number;
  side?: boolean;
}) {
  const [ref, shown] = useInView<HTMLDivElement>(0.15, "0px 0px -8% 0px");
  const Component = Tag as "div";
  return (
    <Component
      ref={ref}
      data-shown={shown}
      className={`${side ? "reveal-side" : "reveal"} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Component>
  );
}

/**
 * Marca-texto que cresce da esquerda para a direita ao entrar na tela.
 * `inverse`: texto claro sobre a faixa — fica escuro até a faixa aparecer, para não sumir no fundo.
 */
export function Marker({ children, color, inverse = false, className = "" }: { children: ReactNode; color?: string; inverse?: boolean; className?: string }) {
  const [ref, shown] = useInView<HTMLSpanElement>(0.6);
  return (
    <span
      ref={ref}
      data-shown={shown}
      className={`marker ${inverse ? "marker-inverse" : ""} ${className}`}
      style={color ? ({ "--marker-color": color } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

export function WordReveal({ text, as: Tag = "h2", className = "" }: { text: string; as?: TextTag; className?: string }) {
  const [ref, shown] = useInView<HTMLDivElement>(0.4);
  const Component = Tag as "div";
  const words = text.split(" ");
  return (
    <Component ref={ref} data-shown={shown} aria-label={text} className={`word-reveal ${className}`}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden>
          <span style={{ "--i": i } as React.CSSProperties}>{word}</span>
          {i < words.length - 1 ? "\u00a0" : null}
        </span>
      ))}
    </Component>
  );
}

export function Marquee({ items, className = "", itemClassName = "", slow = false }: { items: ReactNode[]; className?: string; itemClassName?: string; slow?: boolean }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <span key={i} className={`flex shrink-0 items-center ${itemClassName}`}>
          {item}
        </span>
      ))}
    </div>
  );
  return (
    <div className={`flex overflow-hidden ${className}`}>
      <div className={`flex w-max ${slow ? "animate-marquee-slow" : "animate-marquee"} hover:[animation-play-state:paused]`}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
