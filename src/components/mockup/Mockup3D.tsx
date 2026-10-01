"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";
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

  return (
    <div ref={ref} className={className}>
      {visible ? <Viewer {...props} className="size-full" /> : <MockupSkeleton />}
    </div>
  );
}
