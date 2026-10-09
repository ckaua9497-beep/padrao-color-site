import type { Scope } from "@/lib/multiloja/analytics";
import { dayKeyDaysAgo } from "@/lib/multiloja/core";
import { control } from "./ui";

/* Filtros do painel de análise (numa linha, no cabeçalho, acima dos gráficos): período e canal. Formulário GET, sem JS. */

export const PERIODS = [7, 30, 90] as const;

export function parseAnalyticsSearch(search: Record<string, string | string[] | undefined>): { dias: number; desde: string; canal: string; scope: Scope } {
  const raw = (key: string) => (typeof search[key] === "string" ? (search[key] as string) : "");
  const dias = PERIODS.includes(Number(raw("dias")) as (typeof PERIODS)[number]) ? Number(raw("dias")) : 30;
  const canal = raw("canal") || "todas";
  const scope: Scope = canal === "site" || canal === "multilojas" ? canal : /^\d+$/.test(canal) ? Number(canal) : "todas";
  return { dias, desde: dayKeyDaysAgo(dias - 1), canal: String(scope), scope };
}

export default function AnalyticsFilters({ dias, canal, lojas, action, showCanal = true }: { dias: number; canal: string; lojas: { id: number; nome: string }[]; action: string; showCanal?: boolean }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="filtro-dias" className="mb-1 block text-[12px] font-semibold text-muted">
          Período
        </label>
        <select id="filtro-dias" name="dias" defaultValue={String(dias)} className={control}>
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              Últimos {d} dias
            </option>
          ))}
        </select>
      </div>
      {showCanal && (
        <div>
          <label htmlFor="filtro-canal" className="mb-1 block text-[12px] font-semibold text-muted">
            Canal
          </label>
          <select id="filtro-canal" name="canal" defaultValue={canal} className={`${control} max-w-72`}>
            <option value="todas">Tudo (site + multilojas)</option>
            <option value="site">Só o site da Padrão</option>
            <option value="multilojas">Só as multilojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                Loja: {l.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" className="h-10 rounded-control bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-coral-700">
        Aplicar
      </button>
    </form>
  );
}
