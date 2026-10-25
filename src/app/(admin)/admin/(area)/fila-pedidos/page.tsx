import type { Metadata } from "next";
import Link from "next/link";
import { Empty, KpiStrip, PageHeader, Sheet, Tag } from "@/components/admin/ui";
import { FilaPedidoAcoes } from "@/components/admin/FilaPedidoAcoes";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { ETAPAS_FILA, ETAPA_LABEL, MAX_TENTATIVAS, isEtapaFila, type EtapaFila } from "@/lib/fila-pedidos/regras";
import { contarPorEtapa, listarFila, type EntradaFila } from "@/lib/fila-pedidos/repo";
import { formatDateTime } from "@/lib/multiloja/core";

export const metadata: Metadata = { title: "Fila de pedidos do site" };

const TOM: Record<EtapaFila, "neutral" | "warn" | "ok"> = { pendente: "neutral", enviando: "neutral", conferir: "warn", enviado: "ok", simulado: "neutral", cancelado: "neutral" };

/** Anexos do pedido (URLs do Bunny ou dos arquivos guardados no site), para baixar e conferir. */
function anexosDe(entrada: EntradaFila): { url: string; nome: string; produto: string }[] {
  const produtos = (entrada.payload?.produtos as { productName?: string; arte?: { anexos?: { url?: string; nome?: string }[] } }[] | undefined) ?? [];
  if (produtos.length) return produtos.flatMap((p) => (p.arte?.anexos ?? []).filter((a) => typeof a.url === "string").map((a) => ({ url: a.url as string, nome: a.nome ?? "arquivo", produto: p.productName ?? "" })));
  // Sem o payload (a API caiu antes de montar): os arquivos que o checkout mandou com cada item.
  return entrada.pedido.items.flatMap((item) => (item.files ?? []).map((f) => ({ url: f.url, nome: f.nome, produto: item.name })));
}

export default async function FilaPedidos(props: PageProps<"/admin/fila-pedidos">) {
  const search = await props.searchParams;
  const etapa = typeof search.etapa === "string" && isEtapaFila(search.etapa) ? search.etapa : "";
  const counts = await contarPorEtapa();
  const entradas = await listarFila({ etapa });
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const tabs: { value: EtapaFila | ""; label: string; count: number }[] = [{ value: "", label: "Todos", count: total }, ...ETAPAS_FILA.map((e) => ({ value: e, label: ETAPA_LABEL[e], count: counts[e] ?? 0 }))];

  return (
    <div className="space-y-6">
      <PageHeader
        group="Operação"
        title="Fila de pedidos do site"
        description={`Pedidos do site que não chegaram à produção pelo POST /gerarpedido (API fora do ar, firewall ou resposta sem confirmação), guardados com as artes. Os "aguardando reenvio" vão sozinhos quando a API volta (até ${MAX_TENTATIVAS} tentativas); os "conferir" esperam a equipe: confira no sistema da Padrão antes de reenviar, para não criar o pedido em dobro.`}
      />

      <KpiStrip
        cols={4}
        items={[
          { label: "Aguardando reenvio", value: String((counts.pendente ?? 0) + (counts.enviando ?? 0)), hint: "envio automático a cada minuto" },
          { label: "Para conferir", value: String(counts.conferir ?? 0), hint: "precisam da equipe" },
          { label: "Enviados", value: String(counts.enviado ?? 0), hint: "saíram da fila com número" },
          { label: "Cancelados", value: String(counts.cancelado ?? 0) },
        ]}
      />

      <Sheet flush>
        <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1 border-b border-line px-4 py-3">
          {tabs.map((t) => {
            const active = t.value === etapa;
            return (
              <Link
                key={t.value || "todos"}
                href={t.value ? `/admin/fila-pedidos?etapa=${t.value}` : "/admin/fila-pedidos"}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                  active ? "bg-ink text-white" : "text-muted hover:bg-mist hover:text-ink",
                  !active && t.count === 0 && "opacity-60",
                )}
              >
                {t.label}
                <span className={cx("tabular-nums", active ? "text-white/70" : t.value === "conferir" && t.count > 0 ? "font-bold text-coral-700" : "")}>{t.count}</span>
              </Link>
            );
          })}
        </nav>

        {entradas.length === 0 ? (
          <Empty>Nenhum pedido aqui. Quando a API da Padrão não receber um pedido do site, ele aparece nesta fila.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {entradas.map((e) => {
              const anexos = anexosDe(e);
              return (
                <li key={e.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <div className="min-w-0 space-y-1.5 text-[14px]">
                    <p className="flex flex-wrap items-center gap-2">
                      <strong className="tabular-nums">{e.protocolo}</strong>
                      <Tag tone={TOM[e.etapa]}>{ETAPA_LABEL[e.etapa]}</Tag>
                      {e.numeroPedido && <span className="font-semibold">pedido nº {e.numeroPedido}</span>}
                      <span className="text-muted">· {formatDateTime(e.criadoEm)} · cliente {e.clienteId}</span>
                    </p>
                    <p>
                      {e.pedido.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")} · <strong className="tabular-nums">{formatBRL(e.total)}</strong>
                    </p>
                    {e.motivo && <p className="text-muted">Motivo: {e.motivo}</p>}
                    {e.ultimoErro && (
                      <p className={e.etapa === "conferir" ? "font-semibold text-coral-700" : "text-muted"}>
                        Último erro: {e.ultimoErro}
                        {e.etapa === "pendente" && e.proximaTentativa ? ` · próxima tentativa ${formatDateTime(e.proximaTentativa)}` : ""} · {e.tentativas} {e.tentativas === 1 ? "tentativa" : "tentativas"}
                      </p>
                    )}
                    {anexos.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-[13px] font-semibold">Artes ({anexos.length})</summary>
                        <ul className="mt-1 space-y-0.5 text-[13px]">
                          {anexos.map((a) => (
                            <li key={a.url} className="truncate">
                              <a href={a.url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                                {a.nome}
                              </a>
                              {a.produto && <span className="text-muted"> · {a.produto}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <details>
                      <summary className="cursor-pointer text-[13px] font-semibold">Histórico e dados do pedido</summary>
                      <ul className="mt-1 space-y-0.5 text-[13px] text-muted">
                        {e.historico.map((h, i) => (
                          <li key={i}>
                            {formatDateTime(h.em)} · {h.texto}
                          </li>
                        ))}
                      </ul>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-control bg-mist p-2 text-[11px]">{JSON.stringify(e.payload ?? e.pedido, null, 2)}</pre>
                    </details>
                  </div>
                  <FilaPedidoAcoes protocolo={e.protocolo} etapa={e.etapa} />
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
