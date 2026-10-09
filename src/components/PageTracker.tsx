"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "@/lib/tracking";

/** Conta uma visita a cada página (site da Padrão e multilojas), com a origem ?ref= quando houver. */
export default function PageTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase();
    track("visita", ref ? { ref } : {});
  }, [pathname]);
  return null;
}
