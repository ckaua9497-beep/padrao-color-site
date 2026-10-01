import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "dark" | "brand" | "new" | "pix" | "neutral";

// Todas passam AA em 12px: branco sobre coral claro não passaria, por isso o selo de marca usa o coral escuro.
const TONES: Record<Tone, string> = {
  dark: "bg-ink text-white",
  brand: "bg-coral-700 text-white",
  new: "bg-blue-50 text-preview",
  pix: "bg-coral-50 text-coral-700",
  neutral: "bg-fog text-ink",
};

export function Badge({ tone = "dark", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-micro font-bold uppercase tracking-wide", TONES[tone], className)}>{children}</span>;
}
