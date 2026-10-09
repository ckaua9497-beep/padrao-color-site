import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconBag = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M6 8h12l-1 12H7L6 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconHeadset = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" />
  </svg>
);

export const IconMenu = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 7h16M8 12h12M4 17h16" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconChevron = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconArrow = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);

export const IconCube = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 16V4m-5 5 5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);

export const IconLayers = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const IconTruck = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </svg>
);

export const IconShield = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconWhatsApp = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p} aria-hidden>
    <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.1.82.83-3-.2-.31a8.2 8.2 0 1 1 6.97 3.82zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.1-.5.12-.12.26-.3.39-.45.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.07-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.56-.42h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.08 0 1.22.89 2.4 1.01 2.57.13.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
  </svg>
);

export const IconInstagram = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
  </svg>
);

export const IconFacebook = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p} aria-hidden>
    <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46h1.5V4.5a20 20 0 0 0-2.2-.11c-2.2 0-3.7 1.34-3.7 3.8v2.3H8.1v3h2.5V21h2.9z" />
  </svg>
);

export const IconYoutube = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p} aria-hidden>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z" />
  </svg>
);

export const IconLinkedin = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p} aria-hidden>
    <path d="M6.9 8.6H3.8V20h3.1V8.6zM5.3 3.8a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM20.2 13.3c0-3-1.6-4.9-4.2-4.9a3.6 3.6 0 0 0-3.2 1.8V8.6H9.8V20h3.1v-5.9c0-1.5.6-2.6 2-2.6s1.9 1.1 1.9 2.6V20h3.1v-6.7h.3z" />
  </svg>
);

export const IconTiktok = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p} aria-hidden>
    <path d="M16.6 3h-3v12.2a2.7 2.7 0 1 1-2.7-2.7c.27 0 .53.04.78.12V9.5a5.8 5.8 0 1 0 4.9 5.7V9a7.3 7.3 0 0 0 4.4 1.4V7.3a4.4 4.4 0 0 1-4.4-4.3z" />
  </svg>
);

export const IconMinus = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M5 12h14" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconBalloon = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 3c3.3 0 6 2.6 6 6.2 0 3.8-3 6.8-6 6.8s-6-3-6-6.8C6 5.6 8.7 3 12 3z" />
    <path d="m11 16-1 1.6h4L13 16" />
    <path d="M12 17.6c0 1.6-1.5 2-1.5 3.4" />
  </svg>
);

export const IconGift = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12" />
    <path d="M12 8C10.5 4.5 7 4.6 7 6.4 7 8 10 8 12 8zM12 8c1.5-3.5 5-3.4 5-1.6C17 8 14 8 12 8z" />
  </svg>
);

export const IconStorefront = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 10v10h16V10" />
    <path d="M3 10 5 4h14l2 6c0 1.4-1.2 2.4-2.6 2.4S16 11.4 16 10c0 1.4-1.2 2.4-2.6 2.4S11 11.4 11 10c0 1.4-1.2 2.4-2.6 2.4S6 11.4 6 10c0 1.4-1.1 2.4-1.5 2.4S3 11.4 3 10z" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

/* Monte Seu Kit (objetivos do assistente). */

export const IconUsers = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3" />
    <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.7 2.6 2.3 3 4.9" />
  </svg>
);

export const IconBadge = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="5" y="6" width="14" height="15" rx="2" />
    <path d="M9.5 3h5v4.5h-5z" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M8.5 17.5c.6-1.6 1.8-2.4 3.5-2.4s2.9.8 3.5 2.4" />
  </svg>
);

export const IconTag = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8" cy="8" r="1.4" />
  </svg>
);

export const IconHeart = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />
  </svg>
);

/* Personalização dos itens do kit. */

export const IconBrush = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M20.3 3.7a1.8 1.8 0 0 1 0 2.6l-7.6 7.6-2.6-2.6 7.6-7.6a1.8 1.8 0 0 1 2.6 0z" />
    <path d="M10.1 11.3c-2.3-.2-4.1 1.5-4.1 3.9 0 1.6-.9 2.9-2.5 3.6 1.4.9 3 1.2 4.6 1.2 3.2 0 5.3-2.1 4.6-5.1" />
  </svg>
);

export const IconGrid = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

/* Admin da multiloja (menu lateral). */

export const IconGauge = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4.5 17a8 8 0 1 1 15 0" />
    <path d="m12 13 3.5-3.5" />
    <circle cx="12" cy="13" r="1.2" />
  </svg>
);

export const IconReceipt = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </svg>
);

export const IconChart = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V6M17 16v-8" />
  </svg>
);

export const IconWallet = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2" />
    <path d="M16 13.5h1.5" />
  </svg>
);

export const IconCard = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M14 4.5H6.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base} {...p} aria-hidden>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
);
