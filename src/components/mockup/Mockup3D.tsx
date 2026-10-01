"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { KIND_INFO } from "@/lib/mockup-kinds";
import { MockupSkeleton } from "./MockupSkeleton";

const Viewer = dynamic(() => import("./MockupViewer"), {
  ssr: false,
  loading: () => <MockupSkeleton />,
});

type Props = ComponentProps<typeof Viewer> & { lazy?: boolean };

export default function Mockup3D({ lazy = false, className = "", ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  useEffect(() => {
    if (!lazy || visible) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, visible]);

  // Antes de abrir o 3D, o placeholder já usa o estúdio certo (escuro no neon).
  const dark = KIND_INFO[props.spec.kind]?.scene === "dark";

  return (
    <div ref={ref} className={className}>
      {visible ? <Viewer {...props} className="size-full" /> : <MockupSkeleton dark={dark} />}
    </div>
  );
}
