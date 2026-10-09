import type { Metadata } from "next";
import Link from "next/link";
import { IconCheck } from "@/components/icons";
import CopyLink from "@/components/painel/CopyLink";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { formatBRL } from "@/lib/format";
import { requirePainel } from "@/lib/multiloja/auth";
import StatusBadge from "@/components/painel/StatusBadge";
import { PLAN_INFO, balanceOf, formatDateTime, planRoom, salePrice, sqlDaysAgo } from "@/lib/multiloja/core";
import { releaseDays } from "@/lib/multiloja/config";
import { listComissoes, listPedidos, listSaques, salesSummary } from "@/lib/multiloja/repo-vendas";
import { baseFactor, lojaItens, lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Início" };

export default async function PainelInicio(props: PageProps<"/painel">) {
  const { lojista, loja } = await requirePainel();
  const search = await props.searchParams;
  const url = await lojaUrl(loja);
  const items = await lojaItens(loja.id, loja.margemPadrao);
  const plan = PLAN_INFO[loja.plano];
  const room = planRoom(loja.plano, items.length);

  const steps = [
    { done: items.length > 0, title: "Ative seus produtos", text: "Escolha o que vender e defina a margem.", href: "/painel/produtos" },
    { done: Boolean(loja.logo), title: "Envie sua logo", text: "Ela aparece no topo e no ícone da loja (Personalizar loja → Estilo).", href: "/painel/personalizar" },
    { done: Boolean(loja.temaPublicadoEm), title: "Deixe com a sua cara", text: "Escolha um modelo pronto e troque cores, textos e seções da página inicial.", href: "/painel/personalizar" },
    { done: Boolean(loja.whatsapp), title: "Informe o WhatsApp", text: "Os pedidos chegam por ele.", href: "/painel/loja" },
    { done: loja.sobre.length > 40, title: "Conte sua história", text: "Um texto curto na página Sobre.", href: "/painel/loja" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const example = items[0];
  const exampleBase = example ? example.product.price * baseFactor() : 0;
  const shareText = encodeURIComponent(`Conheça a minha loja de produtos personalizados: ${url}`);
  const mes = await salesSummary(loja.id, sqlDaysAgo(30));
  const saldo = balanceOf(await listComissoes(loja.id), await listSaques(loja.id), releaseDays());
  const recentes = await listPedidos({ lojaId: loja.id, limite: 5 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title">{search.bemvindo ? `Boas-vindas, ${lojista.nome.split(" ")[0]}! Sua loja está no ar.` : `Olá, ${lojista.nome.split(" ")[0]}!`}</h1>
        <p className="mt-1 text-muted">Aqui você cuida da loja {loja.nome}.</p>
      </div>

      <section aria-labelledby="link-loja" className="rounded-panel bg-ink p-6 text-white md:p-8">
        <h2 id="link-loja" className="text-sm font-bold uppercase tracking-[0.2em] text-white/70">
          Link da sua loja
        </h2>
        <p className="mt-2 break-all text-2xl font-black md:text-3xl">{url.replace(/^https?:\/\//, "")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <CopyLink url={url} />
          <Button href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer" variant="light" size="sm">
            Compartilhar no WhatsApp
          </Button>
          <Button href={url} target="_blank" rel="noreferrer" variant="light" size="sm">
            Abrir a loja
          </Button>
        </div>
        <p className="mt-4 text-caption text-white/70">Coloque o link na bio do Instagram e do TikTok e nos stories.</p>
      </section>

      <section aria-labelledby="resumo-vendas" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="resumo-vendas" className="text-xl font-bold">
            Últimos 30 dias
          </h2>
          <Link href="/painel/vendas" className="text-[15px] font-bold underline-offset-4 hover:underline">
            Ver vendas
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Vendas pagas", value: String(mes.pagos) },
            { label: "Faturamento", value: formatBRL(mes.faturamento) },
            { label: "Sua comissão", value: formatBRL(mes.comissao) },
            { label: "Disponível para saque", value: formatBRL(saldo.available), href: "/painel/financeiro" },
          ].map((c) => (
            <div key={c.label} className="rounded-panel bg-white p-4 shadow-card">
              <p className="text-caption font-semibold text-muted">{c.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{c.value}</p>
              {c.href && (
                <Link href={c.href} className="text-caption font-bold underline underline-offset-2">
                  Financeiro
                </Link>
              )}
            </div>
          ))}
        </div>
        {recentes.length > 0 && (
          <ul className="divide-y divide-line rounded-panel bg-white px-5 shadow-card">
            {recentes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[15px]">
                <Link href={`/painel/vendas/${p.codigo}`} className="font-bold underline-offset-4 hover:underline">
                  {p.codigo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {p.cliente.nome} · {formatDateTime(p.criadoEm)}
                </span>
                <span className="font-bold tabular-nums">{formatBRL(p.total)}</span>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-panel bg-white p-5 shadow-card">
          <p className="text-caption font-semibold text-muted">Produtos ativos</p>
          <p className="mt-1 text-3xl font-black tabular-nums">
            {items.length}
            {plan.maxProducts !== null && <span className="text-lg font-bold text-muted"> / {plan.maxProducts}</span>}
          </p>
          <p className="mt-1 text-caption text-muted">{Number.isFinite(room) ? `${room} ${room === 1 ? "vaga" : "vagas"} no plano ${plan.name}` : `Plano ${plan.name}: sem limite`}</p>
        </div>
        <div className="rounded-panel bg-white p-5 shadow-card">
          <p className="text-caption font-semibold text-muted">Margem padrão</p>
          <p className="mt-1 text-3xl font-black tabular-nums">{loja.margemPadrao}%</p>
          <p className="mt-1 text-caption text-muted">Vale para os produtos sem margem própria.</p>
        </div>
        <div className="rounded-panel bg-white p-5 shadow-card">
          <p className="text-caption font-semibold text-muted">Exemplo de lucro</p>
          {example ? (
            <>
              <p className="mt-1 text-3xl font-black tabular-nums">{formatBRL(salePrice(exampleBase, example.margin) - exampleBase)}</p>
              <p className="mt-1 line-clamp-2 text-caption text-muted">
                por venda de {example.product.name} a {formatBRL(salePrice(exampleBase, example.margin))}, antes das taxas de pagamento
              </p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-muted">Ative um produto para ver.</p>
          )}
        </div>
      </div>

      <section aria-labelledby="primeiros-passos" className="rounded-panel bg-white p-6 shadow-card md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="primeiros-passos" className="text-xl font-bold">
            Deixe sua loja pronta para vender
          </h2>
          <p className="text-[15px] font-semibold text-muted">
            {doneCount} de {steps.length} feitos
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Progresso">
          <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {steps.map((step) => (
            <li key={step.title}>
              <Link href={step.href} className={cx("flex items-start gap-3 rounded-control border p-4 transition-colors", step.done ? "border-line bg-mist" : "border-line hover:border-ink")}>
                <span aria-hidden className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", step.done ? "bg-ink text-white" : "border-2 border-line-strong")}>
                  {step.done && <IconCheck className="size-4" />}
                </span>
                <span>
                  <span className={cx("block font-bold", step.done && "text-muted line-through")}>{step.title}</span>
                  <span className="text-caption text-muted">{step.text}</span>
                  <span className="sr-only">{step.done ? " (feito)" : " (pendente)"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
