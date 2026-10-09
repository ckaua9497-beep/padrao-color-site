"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { artFamily, retainSources } from "@/components/mockup/art";
import { IconArrow, IconCheck, IconClock } from "@/components/icons";
import { cartLines } from "@/components/party/item-state";
import { keepArtFiles, uploadedFileOf } from "@/components/product/art-source";
import { artSummary } from "@/components/product/art-summary";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import QtyStepper from "@/components/ui/QtyStepper";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { useCustomerPriceList } from "@/lib/customer";
import { formatBRL, imageUrl, spectrumAt } from "@/lib/format";
import {
  KIT_COUNTS,
  KIT_GOALS,
  MAX_KITS,
  budgetStatus,
  budgetsFor,
  candidateItem,
  emptyKitDetails,
  getBudget,
  getKitGoal,
  initialLine,
  kitCartContext,
  kitItemSpec,
  kitTotals,
  planKitItem,
  suggestPicks,
  unitsLabel,
  type KitArtMode,
  type KitDetails,
  type KitItem,
  type KitLine,
  type KitPlan,
} from "@/lib/kit-builder";
import { businessDaysBetween, getPalette, type PartyProduct } from "@/lib/party";
import { GOAL_ICONS } from "./goal-icons";
import {
  DEFAULT_KIT_LOOK,
  itemArtName,
  itemArtStatus,
  itemMissingArt,
  kitBaseArt,
  photoKey,
  sharedItemArt,
  type ItemArtState,
  type ItemView,
  type KitLogo,
  type KitLook,
  type KitShot,
} from "./kit-art";
import { KitAddPanel } from "./KitAddPanel";
import { KitArtEditor, type ItemArtDraft } from "./KitArtEditor";
import { KitArtPanel } from "./KitArtPanel";
import { KitGallery, type GalleryItem } from "./KitGallery";
import { KitItemCard, perKitUnit } from "./KitItemCard";
import KitPreview from "./KitPreview";

/*
 * Monte o seu kit: assistente em quatro perguntas (para que é, quantos kits, quanto investir por kit e o que
 * não pode faltar, com a pré-seleção dentro do orçamento) e o kit montado:
 * - a arte do kit, feita uma vez (logo, nome, frase, estilo e cores) e encaixada na área de cada item;
 * - os itens, com valor por kit e total, a arte de cada um e "Personalizar" (o editor da página de produto, só
 *   para aquele item);
 * - sugestões e busca no catálogo;
 * - o resumo com a prévia 3D, "Ver o kit inteiro" (a foto 3D de cada item com a arte), o valor por kit, o total,
 *   o orçamento, o prazo e "Adicionar kit ao carrinho" (cada item vai como produto comum, com a arte, a foto 3D e
 *   o grupo do kit).
 */

const STEPS = ["Objetivo", "Quantidade", "Orçamento", "Itens"] as const;

type Status = { tone: "ok" | "error"; text: string } | null;

const clampKits = (value: number) => Math.min(MAX_KITS, Math.max(1, Math.round(value) || 1));

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** O registro sem a chave (item que saiu do kit). */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** "1 pacote de 120", "2 peças", "3 un.": o que cada kit leva do item, na linha do carrinho. */
function perKitLabel(item: KitItem, line: KitLine, plan: KitPlan): string {
  if (item.perPerson) return `${line.perKit} ${perKitUnit(item, line.perKit)} de ${plan.lot.toLocaleString("pt-BR")}`;
  if (item.product.customSize) return `${line.perKit} ${perKitUnit(item, line.perKit)}`;
  return `${line.perKit} un.`;
}

export default function KitBuilder({ catalog }: { catalog: KitItem[] }) {
  const params = useSearchParams();
  const linked = getKitGoal(params.get("objetivo"));
  const start = linked && !linked.href ? linked : undefined;
  const [step, setStep] = useState(start ? 1 : 0);
  const [goalId, setGoalId] = useState<string | null>(start?.id ?? null);
  const [kits, setKits] = useState(start?.defaultKits ?? 10);
  const [kitsText, setKitsText] = useState("");
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [manualPicks, setManualPicks] = useState<string[] | null>(null);
  const [items, setItems] = useState<KitItem[]>([]);
  const [lines, setLines] = useState<Record<string, KitLine>>({});
  const [details, setDetails] = useState<KitDetails>(emptyKitDetails);
  const [daysUntil, setDaysUntil] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  // Arte do kit: o logo (enviado uma vez), o jeito dela, "mandar as artes depois" e o que cada item tem de próprio.
  const [logo, setLogo] = useState<KitLogo | null>(null);
  const [look, setLook] = useState<KitLook>(DEFAULT_KIT_LOOK);
  const [kitLater, setKitLater] = useState(false);
  const [itemArts, setItemArts] = useState<Record<string, ItemArtState>>({});
  const [artMissing, setArtMissing] = useState(false);
  // Foto 3D de cada item com a arte (miniatura do card e do carrinho), com a chave da peça e da arte.
  const [shots, setShots] = useState<Record<string, KitShot>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [gallery, setGallery] = useState<"ver" | "adicionar" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { add } = useCart();

  const goal = getKitGoal(goalId);
  const budget = getBudget(goal, budgetId);
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  // Revendedor logado vê a tabela de revenda em todos os produtos à vista (sugeridos, faixas e os da busca).
  const groupIds = useMemo(
    () => [...new Set([...catalog, ...items].flatMap((item) => [item.product, ...(item.tiers ?? []).map((tier) => tier.product)]).map((product) => product.groupId ?? 0))],
    [catalog, items],
  );
  const pricesFor = useCustomerPriceList(groupIds);
  const withPrices = useCallback(
    (item: KitItem): KitItem => {
      const price = (product: PartyProduct): PartyProduct => {
        const prices = pricesFor({ groupId: product.groupId, category: product.categorySlug, categorySlug: product.categorySlug }, product.variations);
        return prices.reseller ? { ...product, variations: prices.variations } : product;
      };
      return { ...item, product: price(item.product), tiers: item.tiers ? item.tiers.map((tier) => ({ ...tier, product: price(tier.product) })) : null };
    },
    [pricesFor],
  );

  // Sugestões do objetivo com o valor por kit na quantidade escolhida.
  const candidates = useMemo(() => {
    const current = getKitGoal(goalId);
    if (!current) return [];
    return current.candidates.flatMap((candidate) => {
      const base = byId.get(candidate.item);
      if (!base) return [];
      const item = candidateItem(base, candidate);
      return [{ candidate, item, plan: planKitItem(withPrices(item), initialLine(item), kits) }];
    });
  }, [goalId, byId, withPrices, kits]);
  const perKitMap = Object.fromEntries(candidates.map(({ candidate, plan }) => [candidate.item, plan.error ? null : plan.perKit]));
  const suggested = goal ? suggestPicks(goal, perKitMap, budget) : [];
  const picks = manualPicks ?? suggested;
  const picked = candidates.filter(({ candidate }) => picks.includes(candidate.item));
  const pickedPerKit = picked.reduce((sum, { plan }) => sum + plan.perKit, 0);
  const pickedTotal = picked.reduce((sum, { plan }) => sum + plan.priced.total, 0);
  const pickedStatus = budgetStatus(pickedPerKit, budget);

  // O kit montado.
  const plans = useMemo(() => new Map(items.map((item) => [item.key, planKitItem(withPrices(item), lines[item.key] ?? initialLine(item), kits)])), [items, lines, kits, withPrices]);
  const kitPlans = items.flatMap((item) => {
    const plan = plans.get(item.key);
    return plan ? [plan] : [];
  });
  const totals = kitTotals(kitPlans, kits);
  const kitStatus = budgetStatus(totals.perKit, budget);
  const previewItem = items.find((item) => item.key === focusKey) ?? items[0] ?? null;
  const previewPlan = previewItem ? (plans.get(previewItem.key) ?? null) : null;
  const inKit = new Set(items.map((item) => item.product.slug));
  const moreSuggestions = candidates.filter(({ item }) => !items.some((inside) => inside.key === item.key));
  const tight = daysUntil !== null && totals.leadDays !== null && daysUntil <= totals.leadDays + 2;

  // A arte de cada item: a do kit encaixada na peça, a própria (editor do item) ou "mandar depois".
  const baseArt = useMemo(() => kitBaseArt(details, look, logo), [details, look, logo]);
  const kitHasArt = Boolean(logo) || details.brand.trim().length > 0;
  const views = useMemo(() => {
    const map = new Map<string, ItemView>();
    for (const item of items) {
      const plan = plans.get(item.key);
      if (!plan) continue;
      const spec = kitItemSpec(plan);
      const shared = sharedItemArt(baseArt, spec, logo);
      const state = itemArts[item.key];
      const mode: KitArtMode = state ? (state.later ? "later" : state.own ? "own" : "kit") : kitLater ? "later" : "kit";
      const art = state?.own ?? shared;
      map.set(item.key, { key: item.key, spec, shared, art, mode, ownName: state?.ownName ?? null, ownFile: state?.ownFile ?? null, photoKey: photoKey(spec, art) });
    }
    return map;
  }, [items, plans, baseArt, logo, itemArts, kitLater]);
  const shotOf = (key: string): KitShot | null => {
    const view = views.get(key);
    const shot = shots[key];
    return view && shot?.key === view.photoKey ? shot : null;
  };
  const previewView = previewItem ? (views.get(previewItem.key) ?? null) : null;
  const statuses = items.flatMap((item) => {
    const view = views.get(item.key);
    return view ? [itemArtStatus(view, logo, kitHasArt)] : [];
  });
  const artCount = {
    ready: statuses.filter((s) => s.tone === "ok" || s.tone === "own").length,
    later: statuses.filter((s) => s.tone === "later").length,
    missing: statuses.filter((s) => s.tone === "missing").length,
  };

  // As imagens da arte (logo e artes próprias) ficam registradas enquanto o kit usa; a trocada é liberada.
  const owner = useId();
  const sourceKey = [
    ...new Set([logo?.src, logo?.clear, ...Object.values(itemArts).flatMap((state) => [state.own?.src, state.own?.back?.src])].filter((src): src is string => Boolean(src))),
  ].join("\n");
  useEffect(() => {
    retainSources(owner, sourceKey ? sourceKey.split("\n") : []);
  }, [owner, sourceKey]);
  useEffect(() => () => retainSources(owner, []), [owner]);

  const onShot = useCallback((key: string, shot: KitShot) => setShots((current) => (current[key]?.key === shot.key ? current : { ...current, [key]: shot })), []);

  const editingItem = editingKey ? (items.find((item) => item.key === editingKey) ?? null) : null;
  const editingView = editingKey ? (views.get(editingKey) ?? null) : null;
  const editingPlan = editingKey ? (plans.get(editingKey) ?? null) : null;
  const galleryItems: GalleryItem[] = items.flatMap((item) => {
    const view = views.get(item.key);
    const plan = plans.get(item.key);
    if (!view || !plan) return [];
    return [{ key: item.key, title: item.title, image: plan.item.product.image, productName: plan.item.product.name, view, status: itemArtStatus(view, logo, kitHasArt) }];
  });

  const goTo = (next: number) => {
    setStep(next);
    setStatus(null);
    requestAnimationFrame(() => {
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) rootRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      headingRef.current?.focus({ preventScroll: true });
    });
  };

  const chooseGoal = (id: string) => {
    const next = getKitGoal(id);
    if (!next) return;
    if (id !== goalId) {
      setGoalId(id);
      setKits(next.defaultKits);
      setKitsText("");
      setBudgetId(null);
      setManualPicks(null);
    }
    goTo(1);
  };

  const chooseKits = (value: number) => {
    setKits(clampKits(value));
    goTo(2);
  };

  const chooseBudget = (id: string) => {
    if (id !== budgetId) setManualPicks(null);
    setBudgetId(id);
    goTo(3);
  };

  const togglePick = (id: string) => setManualPicks((current) => {
    const list = current ?? suggested;
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  });

  const buildKit = () => {
    if (!goal) return;
    const chosen = picked.map(({ item }) => item);
    // Itens da busca continuam no kit quando o cliente refaz as perguntas.
    const kept = items.filter((item) => item.searched);
    const next = [...chosen, ...kept];
    setItems(next);
    setLines((current) => Object.fromEntries(next.map((item) => [item.key, current[item.key] ?? initialLine(item)])));
    setFocusKey(next[0]?.key ?? null);
    goTo(4);
  };

  const updateLine = (item: KitItem, patch: Partial<KitLine>) => {
    setLines((current) => ({ ...current, [item.key]: { ...(current[item.key] ?? initialLine(item)), ...patch } }));
    setStatus(null);
  };

  const addItem = (item: KitItem) => {
    setFocusKey(item.key);
    setStatus(null);
    if (items.some((inside) => inside.key === item.key)) return;
    setItems((list) => [...list, item]);
    setLines((current) => ({ ...current, [item.key]: current[item.key] ?? initialLine(item) }));
  };

  const removeItem = (item: KitItem) => {
    setItems((list) => list.filter((inside) => inside.key !== item.key));
    // A arte própria e a foto saem junto (as imagens deixam de ficar presas na memória).
    setItemArts((current) => omit(current, item.key));
    setShots((current) => omit(current, item.key));
    setStatus({ tone: "ok", text: `${item.title} saiu do kit.` });
  };

  const updateDetails = (patch: Partial<KitDetails>) => {
    setDetails((current) => ({ ...current, ...patch }));
    if (patch.date !== undefined) setDaysUntil(patch.date ? businessDaysBetween(new Date(), new Date(`${patch.date}T12:00:00`)) : null);
    if (patch.brand?.trim()) setArtMissing(false);
    setStatus(null);
  };

  const updateLook = (patch: Partial<KitLook>) => {
    setLook((current) => ({ ...current, ...patch }));
    setStatus(null);
  };

  const changeLogo = (next: KitLogo | null) => {
    setLogo(next);
    if (next) setArtMissing(false);
    setStatus(null);
  };

  const changeKitLater = (value: boolean) => {
    setKitLater(value);
    if (value) setArtMissing(false);
    setStatus(null);
  };

  const preview = (key: string) => {
    setFocusKey(key);
    if (window.matchMedia("(max-width: 1023px)").matches) document.getElementById("kit-previa")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  const editItem = (key: string) => {
    setGallery(null);
    setFocusKey(key);
    setEditingKey(key);
  };

  /** O editor do item salvou: arte própria (ou de volta à do kit), "enviar depois" e a foto 3D do ângulo do carrinho. */
  const saveItemArt = (key: string, draft: ItemArtDraft, shot: KitShot | null) => {
    const view = views.get(key);
    setEditingKey(null);
    if (!view) return;
    const sameAsKit = !draft.artName && JSON.stringify(draft.art) === JSON.stringify(view.shared);
    const own = sameAsKit ? null : draft.art;
    setItemArts((current) => {
      // Sem nada próprio e seguindo o kit ("mandar depois" do kit inteiro vale de novo): o item volta ao padrão.
      if (!own && draft.later === kitLater) return omit(current, key);
      return { ...current, [key]: { own, ownName: own ? draft.artName : null, later: draft.later, ownFile: own ? draft.file : null } };
    });
    if (shot) onShot(key, shot);
    setStatus(null);
  };

  const addKit = () => {
    if (!goal || !items.length) return;
    const blocked = items.find((item) => plans.get(item.key)?.error);
    if (blocked) {
      setStatus({ tone: "error", text: `Confira “${blocked.title}”: ${plans.get(blocked.key)?.error}` });
      document.getElementById(`kit-item-${blocked.key}`)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    const lacking = items.find((item) => {
      const view = views.get(item.key);
      return view ? itemMissingArt(view, kitHasArt) : false;
    });
    if (lacking) {
      if (views.get(lacking.key)?.mode === "own") {
        setStatus({ tone: "error", text: `Falta a arte de “${lacking.title}”.` });
        editItem(lacking.key);
        return;
      }
      setArtMissing(true);
      setStatus({ tone: "error", text: "Falta a arte do kit: envie o logo, escreva o nome da marca ou marque “mandar as artes depois”." });
      document.getElementById("kit-arte")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      return;
    }
    // Itens ainda sem a foto 3D com a arte: a galeria fotografa (um por vez) e adiciona quando terminar.
    if (items.some((item) => views.has(item.key) && !shotOf(item.key))) {
      setGallery("adicionar");
      return;
    }
    commitAdd();
  };

  /**
   * Cada item vai como produto comum: variação, quantidade, a arte (resumo, nome e os arquivos enviados, que o checkout
   * manda para o Bunny), a foto 3D e o grupo do kit.
   */
  const commitAdd = async () => {
    setGallery(null);
    if (!goal) return;
    const context = kitCartContext(goal, kits, details);
    // O logo do kit fica guardado uma vez só no navegador, mesmo indo em vários itens.
    const kept = new Map<File, string>();
    let count = 0;
    for (const item of items) {
      const plan = plans.get(item.key);
      const view = views.get(item.key);
      const line = lines[item.key] ?? initialLine(item);
      if (!plan || !view) continue;
      const sources: { file: File | null | undefined; kind: "arquivo" | "verso" }[] =
        view.mode === "later" || view.spec.blank
          ? []
          : view.mode === "own"
            ? [
                { file: view.art.src ? uploadedFileOf(view.art.src) : view.ownFile, kind: "arquivo" },
                { file: uploadedFileOf(view.art.back?.src), kind: "verso" },
              ]
            : [{ file: logo?.file, kind: "arquivo" }];
      const artFiles = await keepArtFiles(sources, plan.item.product.name, kept);
      const art = view.mode === "later" || view.spec.blank ? {} : artSummary(view.art, artFamily(view.spec.kind));
      // Arte do kit com o nome da marca ou o fundo na cor da marca: o nome das cores (o resumo traz os códigos).
      const palette = view.mode === "kit" && !view.spec.blank && (Boolean(art["Texto da arte"]) || (Boolean(logo?.src) && look.background === "marca"));
      const options = { ...context.options, "Por kit": perKitLabel(item, line, plan), ...art, ...(palette ? { "Cores da marca": getPalette(details.palette).label } : {}) };
      for (const cartLine of cartLines(plan.item, plan.priced, { options, artName: itemArtName(view, logo), bundle: context.bundle, sizes: line.sizes, preview: shotOf(item.key)?.src ?? null })) {
        add({ ...cartLine, artFiles: artFiles.length ? artFiles : null });
        count += 1;
      }
    }
    setStatus({ tone: "ok", text: `Pronto! O kit foi para o carrinho (${count} ${count === 1 ? "item" : "itens"}).` });
  };

  // ---------------------------------------------------------------------------------- assistente
  if (step < 4 || !goal) {
    const current = Math.min(step, 3);
    const budgets = budgetsFor(goal);
    const titles = [
      "Para que é o seu kit?",
      "Quantos kits você vai montar?",
      "Quanto quer investir por kit?",
      "O que não pode faltar?",
    ];
    const hints = [
      "Escolha uma opção e a gente sugere os produtos certos. Você ajusta tudo depois.",
      goal ? `Um kit para cada ${goal.unit[0]}. O valor de cada item muda com a quantidade, porque há faixas de preço.` : "",
      "A gente sugere os produtos que cabem nesse valor. O total aparece item a item, sem surpresa.",
      "Já deixamos marcados os que cabem no orçamento. Toque para tirar ou incluir; dá para buscar outros depois.",
    ];
    return (
      <div ref={rootRef} className="scroll-mt-28">
        <section aria-labelledby="kit-pergunta" className="mx-auto max-w-5xl rounded-card bg-white p-5 shadow-card ring-1 ring-line sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Monte o seu kit</p>
            <p className="text-caption text-muted">
              Passo {current + 1} de {STEPS.length} · {STEPS[current]}
            </p>
          </div>
          <ol aria-hidden className="mt-4 grid grid-cols-4 gap-1.5">
            {STEPS.map((label, i) => (
              <li key={label} className={cx("h-1.5 rounded-full transition-colors duration-300", i <= current ? "bg-ink" : "bg-line")} />
            ))}
          </ol>

          <h2 id="kit-pergunta" ref={headingRef} tabIndex={-1} className="mt-7 text-title font-bold outline-none sm:text-section">
            {titles[current]}
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink/75">{hints[current]}</p>

          <div className="mt-7 motion-safe:animate-fade-up" key={current}>
            {current === 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {KIT_GOALS.map((option, i) => {
                  const Icon = GOAL_ICONS[option.icon];
                  const body = (
                    <>
                      <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i).soft }}>
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold leading-snug">{option.label}</span>
                        <span className="mt-1 block text-caption text-muted">{option.description}</span>
                      </span>
                      <IconArrow aria-hidden className="mt-1 size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  );
                  const look = cx(
                    "group flex h-full w-full items-start gap-3 rounded-card bg-white p-4 text-left ring-inset transition-shadow duration-200 hover:ring-ink",
                    option.id === goalId ? "ring-2 ring-ink" : "ring-1 ring-line-strong",
                  );
                  return (
                    <li key={option.id}>
                      {option.href ? (
                        <Link href={option.href} className={look}>
                          {body}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => chooseGoal(option.id)} aria-pressed={option.id === goalId} className={look}>
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {current === 1 && goal && (
              <div className="grid gap-6">
                <ul className="flex flex-wrap gap-2">
                  {KIT_COUNTS.map((count) => (
                    <li key={count}>
                      <button
                        type="button"
                        onClick={() => chooseKits(count)}
                        aria-pressed={kits === count && !kitsText}
                        className={cx(
                          "inline-flex min-h-12 items-center rounded-full px-5 text-[15px] font-bold transition-colors duration-200",
                          kits === count && !kitsText ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-inset ring-line-strong hover:ring-ink",
                        )}
                      >
                        {unitsLabel(count, goal.unit)}
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = Number(kitsText.replace(/\D/g, ""));
                    if (value > 0) chooseKits(value);
                  }}
                >
                  <TextField
                    label={`Outra quantidade (até ${MAX_KITS})`}
                    value={kitsText}
                    onChange={(value) => setKitsText(value.replace(/\D/g, "").slice(0, 3))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Ex.: 35"
                    className="w-56"
                  />
                  <Button type="submit" variant="dark" size="md" disabled={!Number(kitsText)}>
                    Usar {kitsText ? unitsLabel(clampKits(Number(kitsText)), goal.unit) : "essa quantidade"}
                  </Button>
                </form>
              </div>
            )}

            {current === 2 && (
              <ul className="flex flex-wrap gap-2">
                {budgets.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => chooseBudget(option.id)}
                      aria-pressed={budgetId === option.id}
                      className={cx(
                        "inline-flex min-h-12 items-center rounded-full px-5 text-[15px] font-bold transition-colors duration-200",
                        budgetId === option.id ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-inset ring-line-strong hover:ring-ink",
                      )}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {current === 3 && goal && (
              <>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {candidates.map(({ candidate, item, plan }) => {
                    const on = picks.includes(candidate.item);
                    const blocked = Boolean(plan.error);
                    return (
                      <li key={candidate.item}>
                        <button
                          type="button"
                          onClick={() => togglePick(candidate.item)}
                          aria-pressed={on}
                          disabled={blocked && !on}
                          className={cx(
                            "relative flex h-full w-full items-start gap-3 rounded-card bg-white p-3 text-left ring-inset transition-shadow duration-200 disabled:opacity-50",
                            on ? "ring-2 ring-ink" : "ring-1 ring-line-strong hover:ring-ink",
                          )}
                        >
                          <span className="relative size-16 shrink-0 overflow-hidden rounded-control bg-mist">
                            <Image src={imageUrl(item.product.image)} alt="" fill sizes="64px" className="object-contain p-1" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block pr-7 text-sm font-bold leading-snug">{item.title}</span>
                            <span className="mt-0.5 line-clamp-2 block text-caption text-muted">{item.hint}</span>
                            <span className={cx("mt-1 block text-caption font-semibold tabular-nums", blocked ? "text-coral-700" : "text-ink")}>
                              {blocked ? plan.error : `${formatBRL(plan.perKit)} por kit`}
                            </span>
                          </span>
                          <span
                            aria-hidden
                            className={cx("absolute right-3 top-3 grid size-6 place-items-center rounded-full transition-colors", on ? "bg-ink text-white" : "ring-1 ring-inset ring-line-strong")}
                          >
                            {on && <IconCheck className="size-4" strokeWidth={2.6} />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div aria-live="polite" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-mist px-4 py-3 text-sm">
                  <span>
                    <strong>{picked.length}</strong> {picked.length === 1 ? "item" : "itens"} · <strong className="tabular-nums">{formatBRL(pickedPerKit)}</strong> por kit ·{" "}
                    <span className="tabular-nums">{formatBRL(pickedTotal)}</span> para {unitsLabel(kits, goal.unit)}
                  </span>
                  {pickedStatus && <BudgetChip status={pickedStatus} />}
                </div>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {current > 0 ? (
              <Button variant="outline" size="sm" onClick={() => goTo(current - 1)}>
                Voltar
              </Button>
            ) : (
              <span className="text-caption text-muted">Leva menos de um minuto.</span>
            )}
            {current === 1 && goal && (
              <Button variant="dark" size="md" onClick={() => chooseKits(kitsText ? Number(kitsText) : kits)} iconEnd={<IconArrow className="size-4" />}>
                Continuar com {unitsLabel(kitsText ? clampKits(Number(kitsText)) : kits, goal.unit)}
              </Button>
            )}
            {current === 2 && (
              <Button variant="outline" size="md" onClick={() => chooseBudget("livre")}>
                Pular esta pergunta
              </Button>
            )}
            {current === 3 && (
              <Button variant="buy" size="md" disabled={!picked.length} onClick={buildKit} iconEnd={<IconArrow className="size-4" />}>
                Montar meu kit
              </Button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------------- kit montado
  return (
    <div ref={rootRef} className="scroll-mt-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:gap-14">
        <div className="min-w-0">
          <header>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Seu kit</p>
            <h2 id="kit-titulo" ref={headingRef} tabIndex={-1} className="mt-2 text-display outline-none">
              {goal.name}
            </h2>
            <p className="mt-3 text-lead text-ink/80" aria-live="polite">
              {unitsLabel(kits, goal.unit)} · <strong className="tabular-nums">{formatBRL(totals.perKit)}</strong> por kit · <span className="tabular-nums">{formatBRL(totals.total)}</span> no
              total
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {budget && budget.id !== "livre" && <span className="rounded-full bg-mist px-3 py-1 font-semibold">Orçamento por kit: {budget.label}</span>}
              {kitStatus && <BudgetChip status={kitStatus} />}
              <button type="button" onClick={() => goTo(0)} className="min-h-9 px-1 font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                Refazer as perguntas
              </button>
            </div>
          </header>

          <section id="kit-arte" aria-labelledby="kit-arte-titulo" className="mt-10 scroll-mt-28">
            <h3 id="kit-arte-titulo" className="text-title font-bold">
              Personalize todos os itens de uma vez
            </h3>
            <p className="mb-5 mt-2 max-w-2xl text-body text-ink/75">
              Envie o logo e escreva o nome da marca: a gente encaixa a arte em cada item, no tamanho da área de impressão dele. Depois, se quiser, ajuste um item por vez em
              “Personalizar”.
            </p>
            <KitArtPanel
              details={details}
              onDetails={updateDetails}
              daysUntil={daysUntil}
              look={look}
              onLook={updateLook}
              logo={logo}
              onLogo={changeLogo}
              art={baseArt}
              later={kitLater}
              onLater={changeKitLater}
              missing={artMissing}
              count={items.length}
              onGallery={() => setGallery("ver")}
            />
          </section>

          <section aria-labelledby="kit-itens" className="mt-12">
            <h3 id="kit-itens" className="text-title font-bold">
              Itens do kit <span className="font-normal text-muted">({items.length})</span>
            </h3>
            <p className="mb-5 mt-2 max-w-2xl text-body text-ink/75">
              Mude a quantidade por kit, a cor ou o formato: o valor de cada item e o total mudam na hora. Em “Personalizar”, a arte de um item muda só nele.
            </p>
            {items.length ? (
              <ul className="grid gap-4">
                {items.map((item) => {
                  const plan = plans.get(item.key);
                  const view = views.get(item.key);
                  if (!plan || !view) return null;
                  return (
                    <KitItemCard
                      key={item.key}
                      item={item}
                      plan={plan}
                      line={lines[item.key] ?? initialLine(item)}
                      kits={kits}
                      view={view}
                      status={itemArtStatus(view, logo, kitHasArt)}
                      shot={shotOf(item.key)?.src ?? null}
                      onLine={(patch) => updateLine(item, patch)}
                      onRemove={() => removeItem(item)}
                      onPreview={() => preview(item.key)}
                      onEdit={() => editItem(item.key)}
                      previewing={previewItem?.key === item.key}
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-card bg-mist p-5 text-sm">O kit está vazio. Adicione uma sugestão ou busque um produto logo abaixo.</p>
            )}
          </section>

          <section aria-labelledby="kit-adicionar" className="mt-12">
            <h3 id="kit-adicionar" className="mb-4 text-title font-bold">
              Adicionar ao kit
            </h3>
            <KitAddPanel suggestions={moreSuggestions.map(({ item, plan }) => ({ item, plan }))} inKit={inKit} onAdd={addItem} />
          </section>

        </div>

        <aside aria-label="Resumo do kit" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <KitPreview
            id="kit-previa"
            view={previewView}
            title={previewItem?.title ?? null}
            product={previewPlan?.item.product ?? previewItem?.product ?? null}
            shot={previewItem ? shotOf(previewItem.key) : null}
            paused={editingKey !== null || gallery !== null}
            onShot={onShot}
            onGallery={() => setGallery("ver")}
          />
          <div className="mt-5 rounded-card bg-mist p-5">
            <p className="text-caption text-muted">
              {goal.label} · {items.length} {items.length === 1 ? "item" : "itens"}
            </p>
            <Price className="mt-1" value={totals.perKit} unit="por kit" size="total" live />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div>
                <p className="mb-1.5 text-caption font-semibold">Kits</p>
                <QtyStepper size="sm" value={kits} min={1} max={MAX_KITS} onChange={(value) => setKits(clampKits(value))} label="Quantidade de kits" />
              </div>
              <p className="text-right">
                <span className="block text-caption text-muted">Total para {unitsLabel(kits, goal.unit)}</span>
                <span className="block text-[19px] font-bold tabular-nums">{formatBRL(totals.total)}</span>
              </p>
            </div>
            {kitStatus && (
              <p className="mt-3 text-sm">
                <BudgetChip status={kitStatus} />
              </p>
            )}
            {totals.leadDays && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink/80">
                <IconClock className="size-4 text-coral-700" /> Produção em até {totals.leadDays} {totals.leadDays === 1 ? "dia útil" : "dias úteis"}
              </p>
            )}
            {tight && (
              <p className="mt-2 text-sm font-semibold text-coral-700">
                Faltam {daysUntil} {daysUntil === 1 ? "dia útil" : "dias úteis"} para a data: com a produção e a entrega, o prazo fica apertado. Fale com a gente antes de pedir.
              </p>
            )}
            {totals.errors > 0 && (
              <p className="mt-2 text-sm font-semibold text-coral-700">
                {totals.errors === 1 ? "Um item precisa de ajuste" : `${totals.errors} itens precisam de ajuste`} antes de ir para o carrinho.
              </p>
            )}
            {artCount.missing + artCount.ready + artCount.later > 0 && (
              <p className={cx("mt-3 flex items-start gap-1.5 text-sm font-medium", artCount.missing ? "text-coral-700" : "text-ink/80")}>
                {!artCount.missing && <IconCheck className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />}
                <span>
                  {artCount.missing
                    ? `Falta a arte em ${artCount.missing} ${artCount.missing === 1 ? "item" : "itens"}.`
                    : !artCount.ready
                      ? "Você manda as artes depois do pedido; a equipe entra em contato."
                      : `Arte pronta em ${artCount.ready} ${artCount.ready === 1 ? "item" : "itens"}${artCount.later ? ` · ${artCount.later} para mandar depois` : ""}.`}
                </span>
              </p>
            )}
            <Button variant="buy" size="lg" block className="mt-4" disabled={!items.length} onClick={addKit}>
              Adicionar kit ao carrinho
            </Button>
            <p aria-live="polite" className={cx("text-sm font-semibold", status && "mt-3", status?.tone === "error" ? "text-coral-700" : "text-ink")}>
              {status?.text}
            </p>
            {status?.tone === "ok" && status.text.startsWith("Pronto") && (
              <Button href="/carrinho" variant="outline" size="sm" block className="mt-3">
                Ver o carrinho
              </Button>
            )}
            <p className="mt-3 text-caption text-muted">
              Valor calculado item a item com os preços do catálogo, na faixa de quantidade de cada produto e sem desconto de kit. O frete é calculado na finalização da compra.
            </p>
          </div>
        </aside>
      </div>

      {editingItem && editingView && editingPlan && (
        <KitArtEditor
          key={editingItem.key}
          title={editingItem.title}
          product={editingPlan.item.product}
          view={editingView}
          logoName={logo?.src ? logo.name : null}
          onSave={(draft, shot) => saveItemArt(editingItem.key, draft, shot)}
          onClose={() => setEditingKey(null)}
        />
      )}

      {gallery && (
        <KitGallery
          items={galleryItems}
          shots={shots}
          onShot={onShot}
          adding={gallery === "adicionar"}
          onAdd={commitAdd}
          onAddWhenReady={() => setGallery("adicionar")}
          onEdit={editItem}
          onClose={() => setGallery(null)}
          perKit={totals.perKit}
          total={totals.total}
          units={unitsLabel(kits, goal.unit)}
        />
      )}
    </div>
  );
}

/** Valor por kit em relação ao orçamento: dentro, acima ou com sobra. */
function BudgetChip({ status }: { status: { tone: "ok" | "over" | "under"; diff: number } }) {
  const look = status.tone === "over" ? "bg-coral-50 text-coral-700" : status.tone === "under" ? "bg-sun-50 text-ink" : "bg-lime-50 text-ink";
  const text =
    status.tone === "over" ? `${formatBRL(status.diff)} acima do orçamento por kit` : status.tone === "under" ? `Sobra ${formatBRL(status.diff)} por kit: dá para incluir mais um item` : "Dentro do orçamento";
  return <span className={cx("inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold", look)}>{text}</span>;
}
