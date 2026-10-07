import type { ReactNode } from "react";
import { IconCheck } from "@/components/icons";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { cx } from "@/components/ui/cx";

const BENEFITS = [
  "Acompanhe a produção e a entrega dos seus pedidos",
  "Reenvie a arte quando a pré-impressão pedir",
  "Revendedor vê e compra pela tabela de revenda",
  "Finalize compras sem digitar seus dados de novo",
] as const;

/** Moldura das páginas de entrar, criar conta e recuperar acesso. */
export function AuthShell({ title, subtitle, crumb, wide = false, children }: { title: string; subtitle: string; crumb: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="bg-page-cart">
      <div className="container-site py-10 md:py-14">
        <Breadcrumb items={[{ href: "/", label: "Início" }, { label: crumb }]} />
        <div className={cx("mt-6 grid gap-6", wide ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]")}>
          <section className="rounded-card border border-line-strong bg-white p-6 md:p-8">
            <h1 className="text-title font-bold">{title}</h1>
            <p className="mt-2 text-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </section>
          <aside className="h-fit rounded-card bg-ink p-6 text-white on-dark md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral">Sua conta Padrão Color</p>
            <ul className="mt-5 space-y-4">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex gap-3 text-[15px] leading-snug">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white text-ink">
                    <IconCheck aria-hidden className="size-3.5" strokeWidth={2.6} />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Cartão das seções da área logada. */
export function AccountCard({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-card border border-line-strong bg-white p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
