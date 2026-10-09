/*
 * Gráficos do painel de análise (sem biblioteca). Regras da skill de dataviz: uma medida por gráfico (nunca dois
 * eixos), uma cor (série única não precisa de legenda: o título diz o que é), barras finas com ponta arredondada
 * presas à linha de base, 2px de vão entre barras, eixo discreto, valor no topo só do maior, dica ao passar o mouse
 * ou focar (o valor também está na tabela "Ver dados"). Texto sempre na cor do texto, nunca na cor da barra.
 */

export type BarPoint = { label: string; value: number; display: string; tick?: string };

/** Colunas verticais (série única): por dia ou por hora. */
export function ColumnChart({ title, points, height = 160, caption }: { title: string; points: BarPoint[]; height?: number; caption?: string }) {
  const max = Math.max(0, ...points.map((p) => p.value));
  const top = max > 0 ? niceMax(max) : 1;
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
  return (
    <figure className="rounded-card bg-white p-5 shadow-sheet">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold">{title}</span>
        {caption && <span className="text-caption text-muted">{caption}</span>}
      </figcaption>
      {points.length === 0 || max === 0 ? (
        <p className="mt-4 text-[14px] text-muted">Sem dados no período.</p>
      ) : (
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-2">
          <div className="flex flex-col justify-between text-right text-[11px] tabular-nums text-muted" style={{ height }} aria-hidden>
            <span>{compact(top)}</span>
            <span>{compact(top / 2)}</span>
            <span>0</span>
          </div>
          <div className="relative" style={{ height }}>
            <div aria-hidden className="absolute inset-x-0 top-0 border-t border-line" />
            <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-line" />
            <ul className="absolute inset-0 flex items-end gap-[2px] border-b border-line-strong" aria-label={title}>
              {points.map((p, i) => (
                <li key={p.label} className="group relative flex h-full flex-1 items-end justify-center">
                  <span
                    tabIndex={0}
                    aria-label={`${p.label}: ${p.display}`}
                    className="block w-full max-w-6 rounded-t-[4px] bg-ink outline-offset-2 transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max(p.value > 0 ? 2 : 0, (p.value / top) * 100)}%` }}
                  />
                  {i === peak && p.value > 0 && (
                    <span aria-hidden className="pointer-events-none absolute -translate-y-1 whitespace-nowrap text-[11px] font-bold tabular-nums" style={{ bottom: `${(p.value / top) * 100}%` }}>
                      {p.display}
                    </span>
                  )}
                  <span role="tooltip" className="pointer-events-none absolute bottom-full z-float mb-2 hidden whitespace-nowrap rounded-control bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-float group-focus-within:block group-hover:block">
                    <strong className="tabular-nums">{p.display}</strong> · {p.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div />
          <div className="mt-1 flex gap-[2px] text-[10px] text-muted" aria-hidden>
            {points.map((p) => (
              <span key={p.label} className="flex-1 truncate text-center">
                {p.tick ?? ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {points.length > 0 && (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-muted">Ver dados</summary>
          <table className="mt-2 w-full">
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-t border-line">
                  <td className="py-1 pr-3">{p.label}</td>
                  <td className="py-1 text-right tabular-nums">{p.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}

export type FunnelStep = { label: string; value: number; rate?: string };

/** Funil horizontal: cada etapa com o número e a taxa sobre a anterior (barra fina sobre um trilho = 100%). */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3.5">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[140px_1fr_56px] items-center gap-3 md:grid-cols-[200px_1fr_72px]">
          <span className="text-[14px] font-semibold leading-tight">
            {s.label}
            {s.rate && <span className="block text-[12px] font-normal text-muted">{s.rate} da etapa anterior</span>}
          </span>
          <span className="block h-2.5 rounded-full bg-mist" aria-hidden>
            <span className="block h-2.5 rounded-full bg-ink" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, (s.value / max) * 100)}%` }} />
          </span>
          <span className="text-right text-[15px] font-bold tabular-nums">{s.value.toLocaleString("pt-BR")}</span>
        </li>
      ))}
    </ol>
  );
}

/** Barra horizontal dentro de tabela (magnitude relativa da linha). */
export function InlineBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 w-full min-w-16 rounded-full bg-mist" aria-hidden>
      <span className="block h-2 rounded-full bg-ink" style={{ width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  if (n >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

/** Teto "redondo" do eixo (1, 2, 5 × 10^n). */
function niceMax(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 5, 10]) if (n <= step * power) return step * power;
  return 10 * power;
}
