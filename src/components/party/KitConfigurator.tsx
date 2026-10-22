"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useCustomerPriceList } from "@/lib/customer";
import { IconClock } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { cx } from "@/components/ui/cx";
import { businessDaysBetween, emptyDetails, getPalette, getPartyType, partyArtName, partyOptions, priceItem, sumPriced, type PartyDetails, type PartyItem, type PricedItem } from "@/lib/party";
import { cartLines, initialStates, itemConfig, type ItemState } from "./item-state";
import { partyArt } from "./party-art";
import { PartyDetailsForm } from "./PartyDetailsForm";
import { PartyItemCard } from "./PartyItemCard";
import PartyPreview from "./PartyPreview";

/*
 * Monte Seu Kit: composição fechada. O cliente escreve nome, tema, cores e frase uma vez e ajusta
 * quantidades, formatos e medidas; os itens vão para o carrinho com o bundle do kit (id = slug do kit).
 */

export type KitInfo = { slug: string; name: string; partyType: string; theme: string; palette: string; phrase: string; cover: string };

type Status = { tone: "ok" | "error"; text: string } | null;

export default function KitConfigurator({ kit, items }: { kit: KitInfo; items: PartyItem[] }) {
  const [details, setDetails] = useState<PartyDetails>(() => emptyDetails(getPartyType(kit.partyType), { theme: kit.theme, palette: kit.palette, phrase: kit.phrase }));
  const [states, setStates] = useState<Record<string, ItemState>>(() => initialStates(items));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [daysUntil, setDaysUntil] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const { add } = useCart();

  const palette = getPalette(details.palette);
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
  const totals = sumPriced(items.map((item) => priced[item.key]));
  const art = useMemo(() => partyArt(details), [details]);
  const previewItem = items.find((item) => item.key === focusKey) ?? items.find((item) => item.id === kit.cover) ?? items[0] ?? null;
  const previewPriced = previewItem ? priced[previewItem.key] : null;
  const tight = daysUntil !== null && totals.leadDays !== null && daysUntil <= totals.leadDays + 2;
  const dateNote =
    daysUntil === null ? null : daysUntil === 0 ? "Menos de 1 dia útil até a festa: fale com a gente antes de pedir." : `Faltam ${daysUntil} ${daysUntil === 1 ? "dia útil" : "dias úteis"} até a festa.`;

  const update = (patch: Partial<PartyDetails>) => {
    setDetails((current) => ({ ...current, ...patch }));
    if (patch.name?.trim()) setNameError(false);
    if (patch.date !== undefined) setDaysUntil(patch.date ? businessDaysBetween(new Date(), new Date(`${patch.date}T12:00:00`)) : null);
    setStatus(null);
  };

  const updateItem = (key: string, patch: Partial<ItemState>) => {
    setStates((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    setStatus(null);
  };

  const preview = (key: string) => {
    setFocusKey(key);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("kit-previa")?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
  };

  const addKit = () => {
    if (!details.name.trim()) {
      setNameError(true);
      document.getElementById("kit-nome")?.focus();
      return;
    }
    const invalid = items.find((item) => priced[item.key].error);
    if (invalid) {
      setStatus({ tone: "error", text: `Confira a medida de “${invalid.title}”: ${priced[invalid.key].error}` });
      return;
    }
    const context = { options: { Kit: kit.name, ...partyOptions(details) }, artName: partyArtName(details), bundle: { id: kit.slug, name: kit.name } };
    let count = 0;
    for (const item of items) {
      for (const line of cartLines(item, priced[item.key], { ...context, sizes: states[item.key].sizes })) {
        add(line);
        count += 1;
      }
    }
    setStatus({ tone: "ok", text: `Pronto! O ${kit.name} foi para o carrinho (${count} itens).` });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:gap-14">
      <div className="min-w-0">
        <section aria-labelledby="kit-textos">
          <h2 id="kit-textos" className="flex items-center gap-3 text-title font-bold">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-base text-white">1</span>
            Escreva uma vez
          </h2>
          <p className="mb-7 mt-3 max-w-2xl text-body text-ink/80">O nome, o tema, as cores e a frase valem para todos os itens do kit.</p>
          <PartyDetailsForm idPrefix="kit" details={details} onChange={update} nameError={nameError} dateNote={dateNote} />
        </section>

        <section aria-labelledby="kit-itens" className="mt-12">
          <h2 id="kit-itens" className="flex items-center gap-3 text-title font-bold">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-base text-white">2</span>
            Ajuste quantidades e medidas
          </h2>
          <p className="mb-6 mt-3 max-w-2xl text-body text-ink/80">
            A composição do kit é fixa. Quer trocar ou tirar itens?{" "}
            <Link href="/crie-sua-festa" className="font-semibold underline underline-offset-4">
              Monte a festa do seu jeito
            </Link>
            .
          </p>
          <ul className="grid gap-4">
            {items.map((item) => (
              <PartyItemCard
                key={item.key}
                item={item}
                priced={priced[item.key]}
                state={states[item.key]}
                onChange={(patch) => updateItem(item.key, patch)}
                onPreview={() => preview(item.key)}
                previewing={previewItem?.key === item.key}
              />
            ))}
          </ul>
        </section>
      </div>

      {/*
        Preso ao rolar. O resumo é mais alto que a tela de um notebook: o painel fica na altura disponível e rola por
        dentro (o botão do carrinho sempre ao alcance), e o 3D encolhe (--lado) para a prévia caber inteira.
        px-1/-mx-1: espaço para o contorno de foco dos botões de largura total, que a rolagem cortaria.
      */}
      <aside
        aria-label="Resumo do kit"
        className="min-w-0 lg:sticky lg:top-painel lg:-mx-1 lg:max-h-[calc(100dvh-var(--spacing-painel)-1rem)] lg:self-start lg:overflow-y-auto lg:px-1 lg:[--lado:clamp(16rem,calc(100dvh-var(--spacing-painel)-8.5rem),100%)] lg:[scrollbar-width:thin]"
      >
        <PartyPreview id="kit-previa" item={previewItem} selection={previewPriced?.lines[0]?.selection ?? null} size={previewPriced?.size ?? null} art={art} palette={palette} />
        <div className="mt-5 rounded-card bg-mist p-5">
          <p className="text-caption text-muted">
            {kit.name} · {items.length} itens
          </p>
          <Price className="mt-1" value={totals.total} from={totals.open} size="total" />
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
          <Button variant="buy" size="lg" block className="mt-4" onClick={addKit}>
            Adicionar kit ao carrinho
          </Button>
          <p aria-live="polite" className={cx("text-sm font-semibold", status && "mt-3", status?.tone === "error" ? "text-coral-700" : "text-ink")}>
            {status?.text}
          </p>
          {status?.tone === "ok" && (
            <Button href="/carrinho" variant="outline" size="sm" block className="mt-3">
              Ver o carrinho
            </Button>
          )}
          <p className="mt-3 text-caption text-muted">
            Valor calculado item a item, com os preços do catálogo e sem desconto de kit. Itens com opções em aberto vão na configuração mais em conta. O frete é calculado na finalização da compra.
          </p>
        </div>
      </aside>
    </div>
  );
}
