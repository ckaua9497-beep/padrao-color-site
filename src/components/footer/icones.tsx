import type { SVGProps } from "react";

/*
 * Ícones do rodapé (Figma "LOJA ONLINE - PADRAOCOLOR", captura do rodapé do padraocolor.com.br): traço fino, cantos
 * arredondados e as redes dentro de um quadrado arredondado. Usam currentColor (laranja no rodapé).
 */

type Props = SVGProps<SVGSVGElement>;

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconeTelefone = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M3 9.2C3 7.4 7 5 12 5s9 2.4 9 4.2v1.3a1 1 0 0 1-1 1h-2.6a1 1 0 0 1-1-1V9.2a11 11 0 0 0-8.8 0v1.3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M7.3 13.2 5.6 19h12.8l-1.7-5.8" />
    <circle cx="12" cy="15.6" r="1.6" />
  </svg>
);

export const IconeEmail = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.8 7.2 8.2 6 8.2-6" />
  </svg>
);

export const IconeLocal = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 21s-6.5-5.5-6.5-11a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const IconeYoutube = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="2.5" y="5" width="19" height="14" rx="4" />
    <path d="M10.2 9.4v5.2l4.4-2.6z" />
  </svg>
);

export const IconeFacebook = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <path d="M15.4 7.8h-1.5a2.4 2.4 0 0 0-2.4 2.4v10.3M9.4 13h5.4" />
  </svg>
);

export const IconeInstagram = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <circle cx="12" cy="12" r="3.7" />
    <circle cx="16.9" cy="7.1" r="0.5" fill="currentColor" />
  </svg>
);

export const IconeLinkedin = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <path d="M8.2 10.8v5.6M8.2 7.8v.01M11.8 16.4v-5.6M11.8 13.4a2.4 2.4 0 0 1 4.8 0v3" />
  </svg>
);

export const IconeTiktok = (p: Props) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <path d="M12.6 7v7.4a2.5 2.5 0 1 1-2.5-2.5M12.6 7c.3 1.6 1.6 2.8 3.3 2.9" />
  </svg>
);
