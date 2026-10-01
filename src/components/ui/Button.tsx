import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "buy" | "dark" | "light" | "outline" | "preview" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold transition-[background-color,color,border-color,box-shadow] duration-450 ease-button disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  // Branco sobre coral só passa como texto grande: o tamanho "sm" usa o coral escuro (ver smallBuy).
  buy: "rounded-full bg-buy text-white hover:bg-buy-hover",
  dark: "rounded-full bg-ink text-white hover:bg-coral-700",
  light: "rounded-full bg-white text-ink hover:bg-mist",
  outline: "rounded-full border border-line-strong text-ink hover:border-ink",
  preview: "rounded-full border border-preview bg-preview/10 text-preview hover:bg-preview hover:text-white",
  link: "text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 px-5 text-[15px]",
  md: "h-13 px-7 text-button",
  lg: "h-[62px] px-9 text-button-lg",
};

const LINK_SIZES: Record<ButtonSize, string> = { sm: "text-sm", md: "text-base", lg: "text-lg" };

const smallBuy = "rounded-full bg-coral-700 text-white hover:bg-ink";

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa a largura toda. */
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  className?: string;
  children: ReactNode;
};

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };
type AsLink = Common & Omit<ComponentProps<typeof Link>, "className" | "children"> & { href: string };

export function buttonClass({ variant = "buy", size = "md", block = false, className }: Pick<Common, "variant" | "size" | "block" | "className"> = {}) {
  const look = variant === "buy" && size === "sm" ? smallBuy : VARIANTS[variant];
  return cx(BASE, look, variant === "link" ? LINK_SIZES[size] : SIZES[size], block && "w-full", className);
}

const OWN_PROPS = ["variant", "size", "block", "loading", "icon", "iconEnd", "className", "children"] as const;

/** Props que seguem para o elemento nativo (tira as do próprio Button). */
function nativeProps(props: object): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(props as Record<string, unknown>) };
  for (const key of OWN_PROPS) delete rest[key];
  return rest;
}

export function Button(props: AsButton | AsLink) {
  const { variant, size, block, loading = false, icon, iconEnd, className, children } = props;
  const classes = buttonClass({ variant, size, block, className });
  const content = (
    <>
      {loading ? <Spinner /> : icon}
      {children}
      {!loading && iconEnd}
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link {...(nativeProps(props) as unknown as ComponentProps<typeof Link>)} className={classes}>
        {content}
      </Link>
    );
  }

  const rest = nativeProps(props) as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...rest} type={props.type ?? "button"} disabled={props.disabled || loading} aria-busy={loading || undefined} className={classes}>
      {content}
    </button>
  );
}
