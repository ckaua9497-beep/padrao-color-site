import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";

type Props = {
  eyebrow?: string;
  /** Pode conter <Marker> para o marca-texto. */
  title: ReactNode;
  subtitle?: ReactNode;
  action?: { href: string; label: string };
  align?: "left" | "center";
  tone?: "light" | "dark";
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function SectionHeading({ eyebrow, title, subtitle, action, align = "left", tone = "light", as: Tag = "h2", className }: Props) {
  const dark = tone === "dark";
  const centered = align === "center";
  return (
    <div className={cx("flex flex-wrap gap-x-8 gap-y-4", centered ? "flex-col items-center text-center" : "items-end justify-between", className)}>
      <div className={cx("max-w-3xl", centered && "mx-auto")}>
        {eyebrow && <p className={cx("text-sm font-bold uppercase tracking-[0.2em]", dark ? "text-coral" : "text-coral-700")}>{eyebrow}</p>}
        <Tag className={cx("text-section font-bold", eyebrow && "mt-3")}>{title}</Tag>
        {subtitle && <p className={cx("mt-3 text-lead", dark ? "text-white/75" : "text-muted")}>{subtitle}</p>}
      </div>
      {action && (
        <Button href={action.href} variant={dark ? "light" : "outline"} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
