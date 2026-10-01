import Link from "next/link";

export type Crumb = { href?: string; label: string };

/** Trilha de navegação. Item sem `href` é a página atual (`aria-current`). */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Trilha" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {items.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>›</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="underline-offset-4 hover:text-ink hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-ink">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
