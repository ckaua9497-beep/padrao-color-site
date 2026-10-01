"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

const Viewer = dynamic(() => import("./MockupViewer"), {
  ssr: false,
  loading: () => <MockupSkeleton />,
});

export function MockupSkeleton() {
  return (
    <div className="grid size-full place-items-center rounded-card bg-mist">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="relative size-14">
          {["bg-red", "bg-sun", "bg-cyan", "bg-lime"].map((color, i) => (
            <span
              key={color}
              className={`absolute inset-x-1 h-8 rounded-[6px] ${color} animate-pulse`}
              style={{ top: i * 5, transform: `rotate(${-10 + i * 6}deg)`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
        <span className="text-xs font-medium">Montando o mockup 3D…</span>
      </div>
    </div>
  );
}

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

  return (
    <div ref={ref} className={className}>
      {visible ? <Viewer {...props} className="size-full" /> : <MockupSkeleton />}
    </div>
  );
}
