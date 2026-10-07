import type { SVGProps } from "react";

// Ícones do simulador de fachadas, no mesmo traço de components/icons.tsx.
type IconProps = SVGProps<SVGSVGElement>;

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconDownload = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 4v11m-5-4.5 5 5 5-5" />
    <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </svg>
);

export const IconMove = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 3v18M3 12h18" />
    <path d="m9 5.5 3-2.5 3 2.5M9 18.5l3 2.5 3-2.5M5.5 9 3 12l2.5 3M18.5 9l2.5 3-2.5 3" />
  </svg>
);

export const IconReset = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
    <path d="M4.5 4.5V9H9" />
  </svg>
);

export const IconEye = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconCorners = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5" />
  </svg>
);

export const IconStore = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4.5 10v10h15V10" />
    <path d="M3 9.5 5 4h14l2 5.5a2.6 2.6 0 0 1-4.5 1.3 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-4.5 0A2.6 2.6 0 0 1 3 9.5z" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const IconRuler = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M3.5 15.5 15.5 3.5l5 5-12 12z" />
    <path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2" />
  </svg>
);

export const IconFile = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
    <path d="M14 3.5V8h4.5" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </svg>
);
