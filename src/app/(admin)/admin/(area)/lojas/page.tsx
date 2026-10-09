import type { Metadata } from "next";
import AdminStoreRow from "@/components/admin/AdminStoreRow";
import { formatBRL } from "@/lib/format";
import { LOJISTA_TYPE_LABEL, formatDateTime, plural, type LojistaType } from "@/lib/multiloja/core";
import { listLojasAdmin } from "@/lib/multiloja/repo-vendas";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Lojas" };

export default async function AdminLojas(props: PageProps<"/admin/lojas">) {
  const search = await props.searchParams;
  const busca = typeof search.busca === "string" ? search.busca.trim().slice(0, 60) : "";
  const lojas = listLojasAdmin(busca);
  const urls = await Promise.all(lojas.map((l) => lojaUrl({ subdominio: l.subdominio, dominio: null })));

  return (
    <div className="space-y-6">
      <h1 className="text-title">Lojas ({lojas.length})</h1>
      <form className="flex gap-3 rounded-panel bg-white p-4 shadow-card">
        <label htmlFor="busca" className="sr-only">
          Buscar loja
        </label>
        <input id="busca" name="busca" defaultValue={busca} placeholder="Nome da loja, endereço, lojista ou e-mail" className="h-11 flex-1 rounded-full border border-line bg-mist px-4 text-[15px]" />
        <button type="submit" className="h-11 rounded-full bg-ink px-6 text-[15px] font-bold text-white hover:bg-coral-700">
          Buscar
        </button>
      </form>
      <ul className="space-y-3">
        {lojas.map((l, i) => (
          <li key={l.id} className="rounded-panel bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">
                  {l.nome} {!l.ativa && <span className="ml-1 rounded-full bg-mist px-2 py-0.5 text-[12px] text-muted">fora do ar</span>}
                </p>
                <a href={urls[i]} target="_blank" rel="noreferrer" className="text-caption underline underline-offset-2">
                  {urls[i].replace(/^https?:\/\//, "")}
                </a>
                {l.dominio && (
                  <span className="ml-2 text-caption text-muted">
                    + {l.dominio} ({l.dominioVerificado ? "verificado" : "aguardando DNS"})
                  </span>
                )}
                <p className="mt-1 text-caption text-muted">
                  {l.lojistaNome} · {l.lojistaEmail} · {LOJISTA_TYPE_LABEL[l.lojistaTipo as LojistaType] ?? l.lojistaTipo}
                  {l.lojistaStatus === "bloqueado" && " · acesso bloqueado"} · desde {formatDateTime(l.criadoEm, false)}
                </p>
              </div>
              <p className="text-right text-[14px]">
                <span className="block font-bold tabular-nums">{formatBRL(l.faturamento)}</span>
                <span className="text-caption text-muted">
                  {plural(l.pedidosPagos, "venda", "vendas")} · {plural(l.produtos, "produto", "produtos")}
                </span>
              </p>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <AdminStoreRow lojaId={l.id} lojistaId={l.lojistaId} plano={l.plano} ativa={l.ativa} bloqueado={l.lojistaStatus === "bloqueado"} dominio={l.dominio} dominioVerificado={l.dominioVerificado} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
