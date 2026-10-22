"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useCustomerPriceList } from "@/lib/customer";
import { IconArrow, IconCheck, IconClock } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { cx } from "@/components/ui/cx";
import { formatBRL, quantityLabel } from "@/lib/format";
import {
  PARTY_ROLES,
  PARTY_TYPES,
  businessDaysBetween,
  emptyDetails,
  formatDate,
  getPalette,
  getPartyType,
  partyArtName,
  partyBundle,
  partyOptions,
  priceItem,
  sumPriced,
  type PartyDetails,
  type PartyItem,
  type PricedItem,
} from "@/lib/party";
import { cartLines, initialStates, itemConfig, lineDetails, type ItemState } from "./item-state";
import { partyArt } from "./party-art";
import { PartyDetailsForm } from "./PartyDetailsForm";
import { PartyItemCard } from "./PartyItemCard";
import PartyPreview from "./PartyPreview";
import { FotoProduto } from "@/components/FotoProduto";

/*
 * Crie Sua Festa: montagem livre em três passos — (a) a festa (tipo, tema, nome, idade ou data, paleta e
 * frase), (b) os produtos pré-definidos, à la carte, com quantidade, opção e medida (m²), e (c) a revisão
 * com o preço de cada item e o total. "Adicionar tudo ao carrinho" manda cada item como produto comum,
 * com as opções da festa e o bundle "festa-<nome>".
 */

const STEPS = [
  { title: "A festa", heading: "Conte sobre a festa" },
  { title: "Os produtos", heading: "Escolha os produtos" },
  { title: "Revisão", heading: "Revise e leve tudo para o carrinho" },
] as const;

type Status = { tone: "ok" | "error"; text: string } | null;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function PartyBuilder({ items }: { items: PartyItem[] }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<PartyDetails>(() => emptyDetails(PARTY_TYPES[0]));
  const [selected, setSelected] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, ItemState>>(() => initialStates(items));
  const [filter, setFilter] = useState("sugestoes");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [daysUntil, setDaysUntil] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { add } = useCart();

  const type = getPartyType(details.type);
  const palette = getPalette(details.palette);
  const byKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  // Revendedor logado vê a tabela de revenda (com o desconto da categoria); visitante e conta comum, o balcão.
  const pricesFor = useCustomerPriceList(items.map((item) => item.product.groupId ?? 0));
  const customerItems = useMemo(
    () =>
      items.map((item) => {
        const { categorySlug, groupId, variations } = item.product;
        const prices = pricesFor({ groupId, category: categorySlug, categorySlug }, variations);
        return prices.reseller ? { ...item, product: { ...item.product, variations: prices.variations } } : item;
      }),
    [items, pricesFor],
  );
  const priced = useMemo(
    () => Object.fromEntries(customerItems.map((item) => [item.key, priceItem(item, itemConfig(states[item.key]))])) as Record<string, PricedItem>,
    [customerItems, states],
  );
  // Na ordem dos papéis (a lista de produtos já vem agrupada).
  const chosen = useMemo(() => items.filter((item) => selected.includes(item.key)), [items, selected]);
  const totals = sumPriced(chosen.map((item) => priced[item.key]));
  const art = useMemo(() => partyArt(details), [details]);
  const suggested = type.suggested.map((id) => byKey.get(id)).filter((item): item is PartyItem => Boolean(item));
  const missingSuggestions = suggested.filter((item) => !selected.includes(item.key));
  const previewItem = (focusKey ? byKey.get(focusKey) : undefined) ?? chosen[0] ?? suggested[0] ?? items[0] ?? null;
  const previewPriced = previewItem ? priced[previewItem.key] : null;

  const filters = [
    { id: "sugestoes", label: `Sugestões para ${type.label.toLowerCase()}`, count: suggested.length },
    { id: "na-festa", label: "Na festa", count: chosen.length },
    ...PARTY_ROLES.map((role) => ({ id: role.id, label: role.label, count: items.filter((item) => item.role === role.id).length })),
    { id: "todos", label: "Todos", count: items.length },
  ];
  const visible = filter === "sugestoes" ? suggested : filter === "na-festa" ? chosen : filter === "todos" ? items : items.filter((item) => item.role === filter);

  const tight = daysUntil !== null && totals.leadDays !== null && daysUntil <= totals.leadDays + 2;
  const dateNote =
    daysUntil === null ? null : daysUntil === 0 ? "Menos de 1 dia útil até a festa: fale com a gente antes de pedir." : `Faltam ${daysUntil} ${daysUntil === 1 ? "dia útil" : "dias úteis"} até a festa.`;

  const update = (patch: Partial<PartyDetails>) => {
    setDetails((current) => {
      const next = { ...current, ...patch };
      // Paleta ainda na sugestão do tipo anterior: acompanha o tipo novo.
      if (patch.type && patch.type !== current.type && !patch.palette && current.palette === getPartyType(current.type).palette) {
        next.palette = getPartyType(patch.type).palette;
      }
      return next;
    });
    if (patch.name?.trim()) setNameError(false);
    if (patch.date !== undefined) setDaysUntil(patch.date ? businessDaysBetween(new Date(), new Date(`${patch.date}T12:00:00`)) : null);
    setStatus(null);
  };

  const updateItem = (key: string, patch: Partial<ItemState>) => {
    setStates((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setStatus(null);
  };

  const toggle = (key: string) => {
    setSelected((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
    setFocusKey(key);
    setStatus(null);
  };

  const addSuggestions = () => {
    setSelected((list) => [...list, ...suggested.map((item) => item.key).filter((key) => !list.includes(key))]);
    setStatus(null);
  };

  const preview = (key: string) => {
    setFocusKey(key);
    // No celular a prévia fica depois da lista.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("festa-previa")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  };

  const requireName = () => {
    if (details.name.trim()) return true;
    setNameError(true);
    setStep(0);
    requestAnimationFrame(() => document.getElementById("festa-nome")?.focus());
    return false;
  };

  const go = (next: number) => {
    if (next > 0 && !requireName()) return;
    setStep(next);
    setStatus(null);
    requestAnimationFrame(() => {
      const heading = headingRef.current;
      if (!heading) return;
      heading.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      heading.focus({ preventScroll: true });
    });
  };

  const editItem = (key: string) => {
    setFilter("na-festa");
    setFocusKey(key);
    go(1);
  };

  const addAll = () => {
    if (!requireName()) return;
    if (!chosen.length) {
      setStatus({ tone: "error", text: "Escolha pelo menos um produto para a festa." });
      return;
    }
    const invalid = chosen.find((item) => priced[item.key].error);
    if (invalid) {
      setStatus({ tone: "error", text: `Confira a medida de “${invalid.title}”: ${priced[invalid.key].error}` });
      return;
    }
    const context = { options: partyOptions(details), artName: partyArtName(details), bundle: partyBundle(details.name) };
    let count = 0;
    for (const item of chosen) {
      for (const line of cartLines(item, priced[item.key], { ...context, sizes: states[item.key].sizes })) {
        add(line);
        count += 1;
      }
    }
    setStatus({ tone: "ok", text: `Pronto! ${count} ${count === 1 ? "item da festa foi" : "itens da festa foram"} para o carrinho.` });
  };

  const card = (item: PartyItem, headingLevel: "h3" | "h4" = "h3") => (
    <PartyItemCard
      key={item.key}
      headingLevel={headingLevel}
      item={item}
      priced={priced[item.key]}
      state={states[item.key]}
      onChange={(patch) => updateItem(item.key, patch)}
      onPreview={() => preview(item.key)}
      previewing={previewItem?.key === item.key}
      included={selected.includes(item.key)}
      onToggle={() => toggle(item.key)}
    />
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:gap-14">
      <div className="min-w-0">
        <nav aria-label="Etapas da montagem">
          <ol className="grid grid-cols-3 gap-2">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={step === i ? "step" : undefined}
                  className={cx(
                    "flex min-h-11 w-full flex-col items-start gap-1.5 border-t-4 pt-2.5 text-left text-[13px] font-semibold leading-tight transition-colors duration-200 sm:flex-row sm:items-center sm:gap-2 sm:text-sm",
                    step === i ? "border-ink text-ink" : i < step ? "border-coral-700 text-ink/80 hover:text-ink" : "border-line text-muted hover:text-ink",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                      step === i ? "bg-ink text-white" : i < step ? "bg-coral-700 text-white" : "bg-mist text-muted",
                    )}
                  >
                    {i < step ? <IconCheck className="size-3.5" strokeWidth={2.6} /> : i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <h2 ref={headingRef} tabIndex={-1} className="mt-8 scroll-mt-painel text-title font-bold outline-none">
          {STEPS[step].heading}
        </h2>

        {step === 0 && (
          <div className="mt-4">
            <p className="mb-7 max-w-2xl text-body text-ink/80">Escreva uma vez só: o nome, o tema, as cores e a frase entram em todos os itens que você escolher no próximo passo.</p>
            <PartyDetailsForm idPrefix="festa" chooseType details={details} onChange={update} nameError={nameError} dateNote={dateNote} />
            {type.kit && (
              <p className="mt-8 rounded-card bg-mist p-4 text-sm">
                Prefere uma combinação pronta? O{" "}
                <Link href={`/monte-seu-kit/${type.kit}`} className="font-semibold underline underline-offset-4">
                  kit de {type.label.toLowerCase()}
                </Link>{" "}
                já vem com os itens escolhidos.
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="mt-4">
            <p className="max-w-2xl text-body text-ink/80">
              Inclua o que quiser, na quantidade que quiser. Os itens já vêm com uma sugestão de quantidade e, nos vendidos por m², de medida: ajuste à vontade.
            </p>
            {missingSuggestions.length > 0 && (
              <Button variant="outline" size="sm" className="mt-5" onClick={addSuggestions}>
                Incluir {missingSuggestions.length === suggested.length ? "as" : "mais"} {missingSuggestions.length} {missingSuggestions.length === 1 ? "sugestão" : "sugestões"}
              </Button>
            )}

            <div role="group" aria-label="Filtrar produtos" className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cx(
                    "min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 transition-colors duration-200",
                    filter === f.id ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line-strong hover:ring-ink",
                  )}
                >
                  {f.label} <span className={filter === f.id ? "text-white/70" : "text-muted"}>({f.count})</span>
                </button>
              ))}
            </div>

            {filter === "todos" ? (
              PARTY_ROLES.map((role) => {
                const group = items.filter((item) => item.role === role.id);
                if (!group.length) return null;
                return (
                  <section key={role.id} aria-labelledby={`festa-papel-${role.id}`} className="mt-8">
                    <h3 id={`festa-papel-${role.id}`} className="mb-3 text-lg font-bold">
                      {role.label}
                    </h3>
                    <ul className="grid gap-4">{group.map((item) => card(item, "h4"))}</ul>
                  </section>
                );
              })
            ) : visible.length ? (
              <ul className="mt-6 grid gap-4">{visible.map((item) => card(item))}</ul>
            ) : (
              <p className="mt-6 rounded-card bg-mist p-5 text-sm">
                Nenhum produto na festa ainda. Comece pelas{" "}
                <button type="button" onClick={() => setFilter("sugestoes")} className="font-semibold underline underline-offset-4">
                  sugestões para {type.label.toLowerCase()}
                </button>
                .
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 grid gap-6">
            <section aria-labelledby="festa-resumo" className="rounded-card bg-mist p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="festa-resumo" className="text-lg font-bold">
                  {details.name.trim() || "Sua festa"}
                </h3>
                <Button variant="link" size="sm" onClick={() => go(0)}>
                  Editar a festa
                </Button>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Tipo", type.label],
                    ["Tema", details.theme.trim()],
                    ["Idade ou marco", details.age.trim()],
                    ["Data", details.date ? formatDate(details.date) : ""],
                    ["Paleta", palette.label],
                    ["Frase", details.phrase.trim()],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex min-w-0 gap-1.5">
                    <dt className="shrink-0 text-muted">{label}:</dt>
                    <dd className="min-w-0 break-words font-semibold">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {chosen.length === 0 ? (
              <div className="rounded-card border border-line-strong p-6 text-center">
                <p className="font-semibold">Nenhum produto na festa ainda.</p>
                <Button variant="dark" size="sm" className="mt-4" onClick={() => go(1)}>
                  Escolher os produtos
                </Button>
              </div>
            ) : (
              <ul className="grid gap-3" aria-label="Itens da festa">
                {chosen.map((item) => {
                  const p = priced[item.key];
                  const sizes = states[item.key].sizes.trim();
                  return (
                    <li key={item.key} className="flex gap-4 rounded-card bg-white p-4 ring-1 ring-line">
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-mist">
                        <FotoProduto src={item.product.image} alt="" sizes="64px" respiro="p-1" estudio="cobrir" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                          <h3 className="text-[15px] font-bold leading-snug">{item.title}</h3>
                          <p className="tabular-nums">
                            {p.open && <span className="text-caption text-muted">a partir de </span>}
                            <span className="font-bold">{formatBRL(p.total)}</span>
                          </p>
                        </div>
                        <p className="text-caption text-muted">{item.product.name}</p>
                        <ul className="mt-1.5 grid gap-0.5 text-caption text-ink/80">
                          {p.lines.map((line, i) => (
                            <li key={line.label ?? i}>
                              {line.label ? `${line.label} · ` : ""}
                              {lineDetails(item, line, p.size) || "Configuração padrão"} — {line.qty} × {formatBRL(line.unitPrice)} {quantityLabel(line.setQty)}
                            </li>
                          ))}
                          {sizes && <li>Tamanhos: {sizes}</li>}
                        </ul>
                        {p.error && <p className="mt-1 text-caption font-semibold text-coral-700">{p.error}</p>}
                        <div className="mt-1 flex flex-wrap gap-x-4">
                          <button type="button" onClick={() => editItem(item.key)} className="min-h-9 text-caption font-semibold underline underline-offset-4">
                            Editar <span className="sr-only">{item.title}</span>
                          </button>
                          <Link href={`/produto/${item.product.slug}`} target="_blank" className="inline-flex min-h-9 items-center text-caption font-semibold underline underline-offset-4">
                            Ajustar no produto<span className="sr-only"> {item.product.name} (abre em nova aba)</span>
                          </Link>
                          <button type="button" onClick={() => toggle(item.key)} className="min-h-9 text-caption font-semibold text-coral-700 underline underline-offset-4">
                            Remover <span className="sr-only">{item.title}</span>
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid gap-2 text-caption text-muted">
              <p>Valores do catálogo, calculados item a item. Itens com “a partir de” ainda têm opções em aberto (papel, acabamento…): vai para o carrinho a configuração mais em conta. Quer outra? Ajuste na página do produto.</p>
              <p>Depois do pedido, a nossa equipe entra em contato para combinar a arte de cada item com o tema, as cores e os textos da festa.</p>
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {step > 0 ? (
            <Button variant="outline" size="sm" onClick={() => go(step - 1)}>
              Voltar
            </Button>
          ) : (
            <span />
          )}
          {step < 2 && (
            <Button variant="dark" size="md" iconEnd={<IconArrow className="size-5" />} onClick={() => go(step + 1)}>
              {step === 0 ? "Escolher os produtos" : "Revisar a festa"}
            </Button>
          )}
        </div>
      </div>

      {/*
        Preso ao rolar. O resumo é mais alto que a tela de um notebook: o painel fica na altura disponível e rola por
        dentro (o botão do carrinho sempre ao alcance), e o 3D encolhe (--lado) para a prévia caber inteira.
        px-1/-mx-1: espaço para o contorno de foco dos botões de largura total, que a rolagem cortaria.
      */}
      <aside
        aria-label="Resumo da festa"
        className="min-w-0 lg:sticky lg:top-painel lg:-mx-1 lg:max-h-[calc(100dvh-var(--spacing-painel)-1rem)] lg:self-start lg:overflow-y-auto lg:px-1 lg:[--lado:clamp(16rem,calc(100dvh-var(--spacing-painel)-8.5rem),100%)] lg:[scrollbar-width:thin]"
      >
        <PartyPreview id="festa-previa" item={previewItem} selection={previewPriced?.lines[0]?.selection ?? null} size={previewPriced?.size ?? null} art={art} palette={palette} />
        <div className="mt-5 rounded-card bg-mist p-5">
          {chosen.length ? (
            <>
              <p className="text-caption text-muted">
                {chosen.length} {chosen.length === 1 ? "produto" : "produtos"} na festa
              </p>
              <Price className="mt-1" value={totals.total} from={totals.open} size="total" />
            </>
          ) : (
            <p className="text-sm text-ink/80">
              <span className="block font-bold text-ink">Nenhum produto na festa ainda.</span>
              Inclua os itens no passo 2 e o total aparece aqui, calculado item a item.
            </p>
          )}
          {totals.leadDays && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
              <IconClock className="size-4 text-coral-700" /> Produção em até {totals.leadDays} {totals.leadDays === 1 ? "dia útil" : "dias úteis"}
            </p>
          )}
          {tight && (
            <p className="mt-2 text-sm font-semibold text-coral-700">
              A festa é daqui a {daysUntil} {daysUntil === 1 ? "dia útil" : "dias úteis"}: com a produção e a entrega, o prazo fica apertado. Fale com a gente antes de pedir.
            </p>
          )}
          {step === 2 ? (
            <Button variant="buy" size="lg" block className="mt-4" onClick={addAll}>
              Adicionar tudo ao carrinho
            </Button>
          ) : (
            <div className="mt-4 hidden lg:block">
              <Button variant="dark" size="md" block iconEnd={<IconArrow className="size-5" />} onClick={() => go(step + 1)}>
                {step === 0 ? "Escolher os produtos" : "Revisar a festa"}
              </Button>
            </div>
          )}
          <p aria-live="polite" className={cx("text-sm font-semibold", status && "mt-3", status?.tone === "error" ? "text-coral-700" : "text-ink")}>
            {status?.text}
          </p>
          {status?.tone === "ok" && (
            <Button href="/carrinho" variant="outline" size="sm" block className="mt-3">
              Ver o carrinho
            </Button>
          )}
          <p className="mt-3 text-caption text-muted">Valor calculado item a item, com os preços do catálogo. O frete é calculado na finalização da compra.</p>
        </div>
      </aside>
    </div>
  );
}
