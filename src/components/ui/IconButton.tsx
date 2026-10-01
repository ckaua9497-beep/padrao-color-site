import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type Variant = "light" | "dark" | "ghost";

const VARIANTS: Record<Variant, string> = {
  light: "bg-white text-ink shadow-float hover:bg-ink hover:text-white",
  dark: "bg-ink text-white hover:bg-coral-700",
  ghost: "text-current hover:bg-ink/5",
};

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** Nome acessível (vira aria-label e title). */
  label: string;
  variant?: Variant;
  size?: "sm" | "md";
  children: ReactNode;
};

export function IconButton({ label, variant = "light", size = "md", className, children, type = "button", ...rest }: Props) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={cx("grid shrink-0 place-items-center rounded-full transition-colors duration-200", size === "sm" ? "size-9" : "size-11", VARIANTS[variant], className)}
    >
      {children}
    </button>
  );
}
