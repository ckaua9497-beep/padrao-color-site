import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { NovaLojaDrawer, SignupToggle } from "@/components/admin/LojistaForms";
import { Empty, PageHeader, Sheet, Tag, control, table } from "@/components/admin/ui";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { signupOpen } from "@/lib/multiloja/config";
import { LOJISTA_TYPE_LABEL, PLAN_INFO, formatDateTime, type LojistaType, type Plan } from "@/lib/multiloja/core";
import { listLojasAdmin } from "@/lib/multiloja/repo-vendas";
import { lojaUrl, rootDomain } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Lojas" };

export default async function AdminLojas(props: PageProps<"/admin/lojas">) {
  const search = await props.searchParams;
  const busca = typeof search.busca === "string" ? search.busca.trim().slice(0, 60) : "";
  const lojas = await listLojasAdmin(busca);
  const urls = await Promise.all(lojas.map((l) => lojaUrl({ subdominio: l.subdominio, dominio: null })));
  const root = rootDomain();
  const port = root === "localhost" ? /:(\d+)$/.exec((await headers()).get("host") ?? "")?.[1] : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        group="Rede"
        title="Lojas"
        description="Cada multiloja, quem cuida dela e como está vendendo. Clique numa loja para ver os números dela, trocar o plano, tirar do ar ou gerar senha nova."
        actions={<NovaLojaDrawer domainSuffix={`.${root}${port ? `:${port}` : ""}`} />}
      />

      <Sheet flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <SignupToggle open={await signupOpen()} />
          <form className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor="busca" className="sr-only">
              Buscar loja
            </label>
            <input id="busca" name="busca" type="search" defaultValue={busca} placeholder="Loja, endereço, lojista ou e-mail" className={cx(control, "w-full sm:w-72")} />
            <button type="submit" className="h-10 rounded-control bg-ink px-4 text-[14px] font-bold text-white transition-colors hover:bg-coral-700">
              Buscar
            </button>
          </form>
        </div>

        {lojas.length === 0 ? (
          <Empty>{busca ? `Nenhuma loja encontrada para “${busca}”.` : "Nenhuma loja ainda. Use “Nova loja” para criar a primeira."}</Empty>
        ) : (
          <div className={table.wrap}>
            <table className={cx(table.table, "min-w-[900px]")}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Loja</th>
                  <th className={table.th}>Lojista</th>
                  <th className={table.th}>Plano</th>
                  <th className={cx(table.th, "text-right")}>Produtos</th>
                  <th className={cx(table.th, "text-right")}>Vendas pagas</th>
                  <th className={cx(table.th, "text-right")}>Faturamento</th>
                  <th className={table.th}>Situação</th>
                  <th className={table.th}>
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {lojas.map((l, i) => (
                  <tr key={l.id} className={table.row}>
                    <td className={table.td}>
                      <Link href={`/admin/lojas/${l.id}`} className="font-bold underline-offset-4 hover:underline">
                        {l.nome}
                      </Link>
                      <a href={urls[i]} target="_blank" rel="noreferrer" className="block text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline">
                        {urls[i].replace(/^https?:\/\//, "")}
                        {l.dominio && ` · ${l.dominio}`}
                      </a>
                    </td>
                    <td className={table.td}>
                      {l.lojistaNome}
                      <span className="block text-[12px] text-muted">{l.lojistaEmail}</span>
                      <span className="block text-[12px] text-muted">
                        {(LOJISTA_TYPE_LABEL[l.lojistaTipo as LojistaType] ?? l.lojistaTipo).split(" /")[0]} · desde {formatDateTime(l.criadoEm, false)}
                      </span>
                    </td>
                    <td className={table.td}>{PLAN_INFO[l.plano as Plan]?.name ?? l.plano}</td>
                    <td className={table.num}>{l.produtos}</td>
                    <td className={table.num}>{l.pedidosPagos}</td>
                    <td className={cx(table.num, "font-bold")}>{formatBRL(l.faturamento)}</td>
                    <td className={table.td}>
                      <span className="flex flex-wrap gap-1">
                        {l.ativa ? <Tag tone="ok">No ar</Tag> : <Tag>Fora do ar</Tag>}
                        {l.lojistaStatus === "bloqueado" && <Tag tone="warn">Acesso bloqueado</Tag>}
                        {l.dominio && !l.dominioVerificado && <Tag tone="warn">Domínio aguardando</Tag>}
                      </span>
                    </td>
                    <td className={cx(table.td, "text-right")}>
                      <Link href={`/admin/lojas/${l.id}`} className="whitespace-nowrap text-[13px] font-semibold underline-offset-4 hover:underline">
                        Gerenciar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </div>
  );
}
