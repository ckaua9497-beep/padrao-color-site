import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { IconArrow, IconBag, IconCheck, IconClose, IconCube, IconMenu, IconSearch } from "@/components/icons";
import { Marker } from "@/components/motion";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Price } from "@/components/ui/Price";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  AccordionDemo,
  DialogDemo,
  DrawerDemo,
  LoadingButtonDemo,
  OptionGroupDemo,
  QtyStepperDemo,
  SegmentedControlDemo,
  TextFieldDemo,
} from "@/components/design-system/ComponentDemos";
import { ConfiguratorDemo } from "@/components/design-system/ConfiguratorDemo";
import { ContrastBadge, DsSection, Specimen, TokenName } from "@/components/design-system/DsBlocks";
import { DsNav, type DsSectionLink } from "@/components/design-system/DsNav";
import { MotionDemo, type EaseCurve } from "@/components/design-system/MotionDemo";
import { APPROVED_PAIRS, AA, bezierOf, contrast, formatRatio, isHex, parseTheme, resolveValue, typeRoles, type Token } from "@/components/design-system/tokens";
import { getProducts, toSummary, type Product } from "@/lib/catalog";
import { formatBRL } from "@/lib/format";
import { mockupSpec, resolveKind } from "@/lib/mockup";
import { KIND_INFO, MOCKUP_KINDS, type MockupKind } from "@/lib/mockup-kinds";
import { PIX_DISCOUNT, pixPrice } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Design system",
  description: "Tokens, componentes, padrões e mockups 3D da loja Padrão Color.",
};

const WHITE = "#ffffff";
const INK = "#000000";

const SECTIONS: DsSectionLink[] = [
  { id: "marca", label: "Marca" },
  { id: "cores", label: "Cores" },
  { id: "tipografia", label: "Tipografia" },
  { id: "raios", label: "Raios" },
  { id: "sombras", label: "Sombras" },
  { id: "camadas", label: "Camadas" },
  { id: "movimento", label: "Movimento" },
  { id: "componentes", label: "Componentes" },
  { id: "padroes", label: "Padrões" },
  { id: "mockups", label: "Mockups 3D" },
  { id: "acessibilidade", label: "Acessibilidade" },
];

// Frase de amostra por papel tipográfico.
const TYPE_SAMPLES: Record<string, string> = {
  "text-display": "Sua marca impressa com cor de verdade",
  "text-section": "Mais vendidos da semana",
  "text-title": "Cartão de visita 9 × 5 cm",
  "text-amount": "R$ 89,90",
  "text-lead": "Veja o produto em 3D com a sua arte antes de imprimir.",
  "text-body": "Produção a partir de 1 dia útil, com entrega para todo o Brasil e atendimento humano.",
  "text-card-title": "Adesivo em Vinil Premium",
  "text-caption": "Mockup ilustrativo gerado com a sua arte.",
  "text-micro": "MAIS VENDIDO",
  "text-button": "Adicionar ao carrinho",
  "text-button-lg": "Finalizar pedido",
  "text-nav": "Produtos",
};

// Quem usa cada camada.
const LAYER_USES: Record<string, string> = {
  "z-index-float": "WhatsApp flutuante, barras fixas internas",
  "z-index-header": "Cabeçalho fixo da loja",
  "z-index-menu": "Mega menu e busca abertos",
  "z-index-drawer": "Carrinho e menu lateral",
  "z-index-modal": "Diálogo de pré-visualização",
  "z-index-toast": "Avisos e o link “Pular para o conteúdo”",
};

const SPECTRUM_KEYS = ["sun", "amber", "cyan", "lime", "red", "magenta", "blue"];

function cssVar(name: string): string {
  return `var(--${name})`;
}

/** Produtos reais para os cards: mais vendidos de categorias diferentes, com preço. */
function showcaseProducts(products: Product[], count: number): Product[] {
  const seen = new Set<string>();
  const picked: Product[] = [];
  const ranked = [...products].sort((a, b) => Number(b.bestSeller) - Number(a.bestSeller) || Number(b.isNew) - Number(a.isNew));
  for (const p of ranked) {
    if (picked.length >= count) break;
    if (p.price <= 0 || !p.image || seen.has(p.categorySlug)) continue;
    seen.add(p.categorySlug);
    picked.push(p);
  }
  return picked;
}

type KindRow = { kind: MockupKind; count: number; fallback: number; blank: number; variants: string[] };

function kindRows(products: Product[]): KindRow[] {
  const rows = new Map<MockupKind, KindRow>(MOCKUP_KINDS.map((kind) => [kind, { kind, count: 0, fallback: 0, blank: 0, variants: [] }]));
  for (const p of products) {
    const { kind, source } = resolveKind(p);
    const row = rows.get(kind);
    if (!row) continue;
    row.count += 1;
    if (source === "fallback") row.fallback += 1;
    const spec = mockupSpec(p, {});
    if (spec.blank) row.blank += 1;
    if (spec.variant && !row.variants.includes(spec.variant)) row.variants.push(spec.variant);
  }
  return [...rows.values()];
}

export default function DesignSystemPage() {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  // Primitivos de UI: arquivos .tsx de src/components/ui (hooks e utilitários são .ts).
  const uiCount = readdirSync(join(process.cwd(), "src/components/ui")).filter((f) => f.endsWith(".tsx")).length;
  const tokens = parseTheme(css);
  const values = new Map(tokens.map((t) => [t.name, t.value]));
  const colorTokens = tokens.filter((t) => t.name.startsWith("color-"));
  const hexOf = (key: string) => resolveValue(cssVar(`color-${key}`), values);
  const colorGroups = new Map<string, Token[]>();
  for (const t of colorTokens) {
    // O verde do WhatsApp fica no fim do bloco do espectro, mas é cor de terceiro.
    const group = t.name === "color-whatsapp" ? "Terceiros" : t.group;
    colorGroups.set(group, [...(colorGroups.get(group) ?? []), t]);
  }

  const roles = typeRoles(tokens);
  const radii = tokens.filter((t) => t.name.startsWith("radius-"));
  const shadows = tokens.filter((t) => t.name.startsWith("shadow-") || t.name.startsWith("drop-shadow-"));
  const layers = tokens.filter((t) => t.name.startsWith("z-index-"));
  const curves: EaseCurve[] = tokens.flatMap((t) => {
    const points = t.name.startsWith("ease-") ? bezierOf(t.value) : null;
    return points ? [{ name: t.name, value: t.value, points, note: t.note ?? "" }] : [];
  });
  const motionTokens = tokens.filter((t) => t.name.startsWith("default-transition") || t.name.startsWith("animate-"));

  const products = getProducts();
  const showcase = showcaseProducts(products, 3);
  const rows = kindRows(products);
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  // A trilha usa a categoria do próprio produto, como na página de produto.
  const crumbProduct = showcase[0] ?? products[0];
  const samplePrice = showcase[0]?.price ?? 89.9;

  const nav = SECTIONS.map((s) => (s.id === "cores" ? { ...s, count: colorTokens.length } : s.id === "mockups" ? { ...s, count: MOCKUP_KINDS.length } : s));
  const stats = [
    { value: colorTokens.length, label: "tokens de cor" },
    { value: roles.length, label: "papéis de texto" },
    { value: uiCount, label: "componentes de UI" },
    { value: MOCKUP_KINDS.length, label: "tipos de mockup 3D" },
    { value: products.length, label: "produtos no catálogo" },
  ];

  return (
    <div className="container-site pb-24">
      <a
        href="#ds-conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-bold focus:text-white"
      >
        Pular para o conteúdo
      </a>

      {/* Abertura */}
      <header className="relative overflow-hidden py-14 md:py-20">
        <div aria-hidden className="absolute inset-x-0 top-0 flex h-1.5 overflow-hidden rounded-full">
          {SPECTRUM_KEYS.map((key) => (
            <span key={key} className="flex-1" style={{ background: cssVar(`color-${key}`) }} />
          ))}
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Padrão Color · uso interno</p>
        <h1 className="mt-4 max-w-4xl text-display">
          Design system da <Marker>loja</Marker>
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-muted">
          Tokens lidos direto do <TokenName>globals.css</TokenName>, componentes vivos e as regras de contraste, movimento e acessibilidade. Tudo nesta
          página usa as mesmas classes da loja: se algo mudar aqui, mudou no site.
        </p>
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="bg-white px-5 py-4 last:col-span-2 lg:last:col-span-1">
              <dt className="text-caption text-muted">{s.label}</dt>
              <dd className="mt-1 text-3xl font-black tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <DsNav sections={nav} variant="bar" />

      <div className="grid gap-12 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-16">
        <DsNav sections={nav} variant="rail" />

        <div id="ds-conteudo" tabIndex={-1} className="min-w-0 outline-none">
          {/* 01 Marca */}
          <DsSection
            id="marca"
            index={1}
            eyebrow="Marca"
            title="Logo e espectro"
            intro="O logo é sempre a versão colorida. Sobre fundo escuro ele ganha uma placa branca (como no rodapé), nunca uma versão negativa."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <figure className="grid">
                <div className="grid aspect-[4/3] place-items-center rounded-panel border border-line bg-white p-8">
                  <Image src="/logo-padrao-color.png" alt="Logo Padrão Color colorido" width={272} height={111} className="h-auto w-48" />
                </div>
                <figcaption className="mt-2.5 text-caption text-muted">Colorido sobre papel · padrão</figcaption>
              </figure>
              <figure className="grid">
                <div className="grid aspect-[4/3] place-items-center rounded-panel bg-mist p-8">
                  <Image src="/logo-padrao-color.png" alt="Logo sobre a faixa B" width={272} height={111} className="h-auto w-48" />
                </div>
                <figcaption className="mt-2.5 text-caption text-muted">Sobre faixa clara (mist / fog)</figcaption>
              </figure>
              <figure className="grid">
                <div className="grid aspect-[4/3] place-items-center rounded-panel bg-graphite p-8">
                  <span className="rounded-control bg-white px-4 py-3">
                    <Image src="/logo-padrao-color.png" alt="Logo sobre fundo escuro, com placa branca" width={272} height={111} className="h-auto w-40" />
                  </span>
                </div>
                <figcaption className="mt-2.5 text-caption text-muted">Sobre escuro: placa branca, raio control (12px)</figcaption>
              </figure>
            </div>

            <h3 className="mt-12 text-lg font-bold">Espectro do símbolo</h3>
            <p className="mt-1 text-muted">Cores dos cartões coloridos e ícones. Os tons -50 viram fundo de card; nunca texto pequeno sobre a cor cheia.</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {SPECTRUM_KEYS.map((key) => (
                <div key={key} className="overflow-hidden rounded-card border border-line">
                  <div className="h-24" style={{ background: cssVar(`color-${key}`) }} />
                  <div className="h-10" style={{ background: cssVar(`color-${key}-50`) }} />
                  <div className="bg-white px-3 py-2.5">
                    <p className="text-sm font-bold">{key}</p>
                    <p className="text-micro uppercase tabular-nums text-muted">{hexOf(key)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-panel bg-ink p-6 text-white">
              <span className="size-14 shrink-0 rounded-full bg-coral" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  Coral <span className="tabular-nums text-white/70">{hexOf("coral")}</span>
                </p>
                <p className="text-sm text-white/75">Comprar e preço. Hover {hexOf("coral-600")}; texto pequeno usa coral-700 {hexOf("coral-700")}.</p>
              </div>
              <Button variant="buy">Comprar</Button>
            </div>
          </DsSection>

          {/* 02 Cores */}
          <DsSection
            id="cores"
            index={2}
            eyebrow="Cores"
            title={`${colorTokens.length} tokens de cor`}
            intro={
              <>
                Cada amostra mostra o contraste WCAG com o branco e com o ink. Use sempre o token (<TokenName>bg-mist</TokenName>,{" "}
                <TokenName>text-coral-700</TokenName>), nunca o hex.
              </>
            }
          >
            <div className="grid gap-12">
              {[...colorGroups.entries()].map(([group, list]) => (
                <div key={group}>
                  <h3 className="text-lg font-bold">
                    {group} <span className="text-sm font-normal text-muted">· {list.length}</span>
                  </h3>
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {list.map((t) => {
                      const key = t.name.replace(/^color-/, "");
                      const resolved = resolveValue(t.value, values);
                      const hex = isHex(resolved) ? resolved.toLowerCase() : null;
                      const alias = /^var\(--([\w-]+)\)$/.exec(t.value)?.[1]?.replace(/^color-/, "");
                      const onSwatch = hex && contrast(hex, INK) >= contrast(hex, WHITE) ? "text-ink" : "text-white";
                      return (
                        <li key={t.name} className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
                          <div className={`flex h-24 items-end justify-between p-3 ${onSwatch}`} style={{ background: cssVar(t.name) }}>
                            <span className="text-2xl font-bold">Aa</span>
                            {alias && <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-bold text-ink">→ {alias}</span>}
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5 p-3">
                            <p className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-bold">{key}</span>
                              <span className="text-micro uppercase tabular-nums text-muted">{hex ?? "rgba"}</span>
                            </p>
                            {t.note && <p className="text-micro leading-snug text-muted">{t.note}</p>}
                            {hex ? (
                              <div className="mt-auto grid gap-1 pt-1.5 text-[11px]">
                                <span className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="text-muted">vs branco</span>
                                  <ContrastBadge ratio={contrast(hex, WHITE)} compact />
                                </span>
                                <span className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="text-muted">vs ink</span>
                                  <ContrastBadge ratio={contrast(hex, INK)} compact />
                                </span>
                              </div>
                            ) : (
                              <p className="mt-auto pt-1.5 text-micro text-muted">{t.value}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <h3 className="mt-14 text-lg font-bold">Pares aprovados de texto e fundo</h3>
            <p className="mt-1 text-muted">
              Os mesmos pares que <TokenName>src/lib/tokens.test.ts</TokenName> garante no <TokenName>npm test</TokenName>. “AA grande” só vale para texto ≥ 19px bold
              ou ≥ 24px.
            </p>
            <ul className="mt-5 grid gap-2 md:grid-cols-2">
              {APPROVED_PAIRS.map((pair) => {
                const fg = hexOf(pair.fg);
                const bg = hexOf(pair.bg);
                if (!isHex(fg) || !isHex(bg)) return null;
                const ratio = contrast(fg, bg);
                const ok = ratio >= pair.min;
                return (
                  <li key={pair.label} className="flex items-center gap-4 rounded-card border border-line bg-white p-3 pr-4">
                    <span
                      aria-hidden
                      className="grid size-14 shrink-0 place-items-center rounded-thumb text-xl font-bold ring-1 ring-line ring-inset"
                      style={{ background: cssVar(`color-${pair.bg}`), color: cssVar(`color-${pair.fg}`) }}
                    >
                      Aa
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">{pair.label}</p>
                      <p className="mt-0.5 text-micro text-muted">
                        {pair.fg} sobre {pair.bg} · mínimo {pair.min === AA ? "4,5" : "3"}:1
                      </p>
                    </div>
                    <span className="flex flex-col items-end gap-1">
                      <ContrastBadge ratio={ratio} />
                      <span className={`text-[11px] font-bold ${ok ? "text-ink" : "text-coral-700"}`}>{ok ? "✓ aprovado" : "✕ reprovado"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </DsSection>

          {/* 03 Tipografia */}
          <DsSection
            id="tipografia"
            index={3}
            eyebrow="Tipografia"
            title={`Raleway em ${roles.length} papéis`}
            intro={
              <>
                Cada papel é uma classe (<TokenName>text-display</TokenName>, <TokenName>text-caption</TokenName>…) que já traz altura de linha, espaçamento e peso.
                Display e section são fluidos (clamp).
              </>
            }
          >
            <ul className="divide-y divide-line rounded-panel border border-line bg-white">
              {roles.map((role) => (
                <li key={role.name} className="grid gap-3 p-5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 md:p-6">
                  <div className="text-caption">
                    <TokenName>{role.name}</TokenName>
                    <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted tabular-nums">
                      <dt>tamanho</dt>
                      <dd className="truncate text-ink">{role.size}</dd>
                      <dt>linha</dt>
                      <dd className="text-ink">{role.lineHeight ?? "—"}</dd>
                      <dt>peso</dt>
                      <dd className="text-ink">{role.weight ?? "—"}</dd>
                      {role.letterSpacing && (
                        <>
                          <dt>tracking</dt>
                          <dd className="text-ink">{role.letterSpacing}</dd>
                        </>
                      )}
                    </dl>
                    {role.note && <p className="mt-2 text-micro text-muted">{role.note}</p>}
                  </div>
                  <p
                    className="min-w-0 self-center break-words"
                    style={{
                      fontSize: cssVar(role.name),
                      lineHeight: role.lineHeight ? cssVar(`${role.name}--line-height`) : undefined,
                      letterSpacing: role.letterSpacing ? cssVar(`${role.name}--letter-spacing`) : undefined,
                      fontWeight: role.weight ? cssVar(`${role.name}--font-weight`) : undefined,
                      color: role.name === "text-amount" ? cssVar("color-price") : undefined,
                    }}
                  >
                    {TYPE_SAMPLES[role.name] ?? "Padrão Color"}
                  </p>
                </li>
              ))}
            </ul>
          </DsSection>

          {/* 04 Raios */}
          <DsSection id="raios" index={4} eyebrow="Raios" title="Cantos" intro="Cinco raios cobrem tudo. Botões, chips de filtro e selos são pílulas (rounded-full).">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {radii.map((r) => (
                <li key={r.name}>
                  <div className="aspect-square border-2 border-ink bg-mist" style={{ borderRadius: cssVar(r.name) }} />
                  <p className="mt-2.5 text-sm font-bold">rounded-{r.name.replace(/^radius-/, "")}</p>
                  <p className="text-micro tabular-nums text-muted">{r.value}</p>
                </li>
              ))}
              <li>
                <div className="aspect-square rounded-full border-2 border-ink bg-mist" />
                <p className="mt-2.5 text-sm font-bold">rounded-full</p>
                <p className="text-micro text-muted">botões, selos</p>
              </li>
            </ul>
          </DsSection>

          {/* 05 Sombras */}
          <DsSection id="sombras" index={5} eyebrow="Sombras" title="Elevação" intro="Sombras longas e suaves, nunca bordas duras. O card fica quase rente ao fundo; menus e painéis flutuam.">
            <ul className="grid gap-6 rounded-panel bg-mist p-6 sm:grid-cols-2 md:p-10 xl:grid-cols-3">
              {shadows.map((s) => {
                const drop = s.name.startsWith("drop-shadow-");
                const style: CSSProperties = drop ? { filter: `drop-shadow(${cssVar(s.name)})` } : { boxShadow: cssVar(s.name) };
                return (
                  <li key={s.name} className="grid gap-3">
                    <div className="grid h-32 place-items-center rounded-card bg-white" style={style}>
                      <span className="text-sm font-bold">{drop ? `drop-shadow-${s.name.replace(/^drop-shadow-/, "")}` : `shadow-${s.name.replace(/^shadow-/, "")}`}</span>
                    </div>
                    <p className="text-micro leading-snug text-muted">{s.value}</p>
                  </li>
                );
              })}
            </ul>
          </DsSection>

          {/* 06 Camadas */}
          <DsSection id="camadas" index={6} eyebrow="Camadas" title="Ordem de empilhamento" intro="Só estes z-index existem (z-float, z-header…). Nada de z-[999]: se precisar de uma camada nova, ela vira token.">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div aria-hidden className="relative mx-auto h-72 w-full max-w-md">
                {layers.map((layer, i) => (
                  <div
                    key={layer.name}
                    className="absolute flex h-24 w-3/5 items-start justify-between rounded-card border border-line bg-white p-3 shadow-menu"
                    style={{ left: `${i * 8}%`, top: `${(layers.length - 1 - i) * 12}%`, zIndex: i + 1 }}
                  >
                    <span className="text-sm font-bold">{layer.name.replace(/^z-index-/, "")}</span>
                    <span className="rounded-full px-2 py-0.5 text-micro font-bold text-ink" style={{ background: cssVar(`color-${SPECTRUM_KEYS[i % SPECTRUM_KEYS.length]}-50`) }}>
                      {layer.value}
                    </span>
                  </div>
                ))}
              </div>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-micro uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Classe</th>
                    <th className="py-2 pr-4 font-semibold">Valor</th>
                    <th className="py-2 font-semibold">Uso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {layers.map((layer) => (
                    <tr key={layer.name}>
                      <td className="py-2.5 pr-4">
                        <TokenName>z-{layer.name.replace(/^z-index-/, "")}</TokenName>
                      </td>
                      <td className="py-2.5 pr-4 font-bold tabular-nums">{layer.value}</td>
                      <td className="py-2.5 text-muted">{LAYER_USES[layer.name] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DsSection>

          {/* 07 Movimento */}
          <DsSection
            id="movimento"
            index={7}
            eyebrow="Movimento"
            title="Curvas e ritmo"
            intro="Saídas rápidas e chegadas longas, herdadas da Tapz. Com “reduzir movimento” ligado no sistema, reveal, marca-texto, marquee, pulso e fade-up são desligados no globals.css e os componentes usam motion-reduce:transition-none."
          >
            <MotionDemo curves={curves} />
            <ul className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {motionTokens.map((t) => (
                <li key={t.name} className="rounded-card border border-line bg-white px-4 py-3">
                  <TokenName>{t.name.startsWith("animate-") ? t.name : `--${t.name}`}</TokenName>
                  <p className="mt-1.5 text-micro text-muted">{t.value}</p>
                </li>
              ))}
            </ul>
          </DsSection>

          {/* 08 Componentes */}
          <DsSection
            id="componentes"
            index={8}
            eyebrow="Componentes"
            title="Primitivos de UI"
            intro={
              <>
                Tudo em <TokenName>src/components/ui</TokenName>. As demos abaixo são os componentes reais: teste com teclado (Tab, setas, Esc).
              </>
            }
          >
            <div className="grid gap-6">
              <Specimen
                name="Button"
                source="ui/Button.tsx"
                notes="buy em sm vira coral-700 (branco sobre coral só passa como texto ≥ 19px bold). Com href vira <Link> com o mesmo visual."
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-separate border-spacing-y-3 text-left">
                    <thead className="text-micro uppercase tracking-wide text-muted">
                      <tr>
                        <th className="w-24 font-semibold">variant</th>
                        <th className="font-semibold">sm · 44px</th>
                        <th className="font-semibold">md · 52px</th>
                        <th className="font-semibold">lg · 62px</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["buy", "dark", "outline", "preview", "light", "link"] as const).map((variant) => (
                        <tr key={variant} className={variant === "light" ? "bg-mist" : undefined}>
                          <td className="pl-2 align-middle">
                            <TokenName>{variant}</TokenName>
                          </td>
                          {(["sm", "md", "lg"] as const).map((size) => (
                            <td key={size} className="py-1 align-middle">
                              <Button variant={variant} size={size}>
                                {variant === "buy" ? "Comprar" : variant === "preview" ? "Pré-visualizar" : variant === "link" ? "Ver detalhes" : "Ver produtos"}
                              </Button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 grid gap-5 border-t border-line pt-6 md:grid-cols-2">
                  <div>
                    <p className="mb-3 text-caption font-bold text-muted">Desabilitado e com ícone</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="buy" disabled>
                        Comprar
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        Indisponível
                      </Button>
                      <Button variant="dark" size="sm" iconEnd={<IconArrow className="size-4" />}>
                        Ver todos
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-caption font-bold text-muted">Loading (clique)</p>
                    <LoadingButtonDemo />
                  </div>
                </div>
              </Specimen>

              <div className="grid gap-6 xl:grid-cols-2">
                <Specimen name="IconButton" source="ui/IconButton.tsx" notes="label vira aria-label e title. md = 44px, sm = 36px: os dois passam do alvo mínimo de 24px.">
                  <div className="flex flex-wrap items-center gap-4">
                    <IconButton label="Buscar">
                      <IconSearch className="size-5" />
                    </IconButton>
                    <IconButton label="Abrir carrinho" variant="dark">
                      <IconBag className="size-5" />
                    </IconButton>
                    <IconButton label="Abrir menu" variant="ghost">
                      <IconMenu className="size-5" />
                    </IconButton>
                    <span className="mx-1 h-8 w-px bg-line" aria-hidden />
                    <IconButton label="Ver em 3D" size="sm">
                      <IconCube className="size-4" />
                    </IconButton>
                    <IconButton label="Fechar" size="sm" variant="dark">
                      <IconClose className="size-4" />
                    </IconButton>
                  </div>
                </Specimen>

                <Specimen name="Badge" source="ui/Badge.tsx" notes="Todos os tons passam AA em 12px bold. O selo de marca usa coral-700, não coral.">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone="dark">Lançamento</Badge>
                    <Badge tone="brand">Mais vendido</Badge>
                    <Badge tone="new">Novo</Badge>
                    <Badge tone="pix">5% no PIX</Badge>
                    <Badge tone="neutral">Sem impressão</Badge>
                  </div>
                </Specimen>
              </div>

              <Specimen name="Price" source="ui/Price.tsx" notes="Coral só a partir de 19px bold (card e pdp). A linha do PIX usa price-sm (coral-700). total é preto: é soma, não oferta.">
                <div className="grid gap-8 sm:grid-cols-3">
                  <div>
                    <p className="mb-2 text-caption font-bold text-muted">card</p>
                    <Price value={samplePrice} from unit="por unidade" />
                  </div>
                  <div>
                    <p className="mb-2 text-caption font-bold text-muted">pdp</p>
                    <Price size="pdp" value={samplePrice * 10} unit="por 100 un." />
                  </div>
                  <div>
                    <p className="mb-2 text-caption font-bold text-muted">total</p>
                    <Price size="total" value={samplePrice * 12} pix={false} />
                  </div>
                </div>
              </Specimen>

              <Specimen name="OptionGroup" source="ui/OptionGroup.tsx" tone="mist" notes="role=radiogroup com foco itinerante. available=false esmaece, mas continua escolhível.">
                <OptionGroupDemo />
              </Specimen>

              <Specimen name="TextField" source="ui/TextField.tsx" notes="Contador (usados|máximo) com maxLength; erro em coral-700 com role=alert e aria-invalid.">
                <TextFieldDemo />
              </Specimen>

              <div className="grid gap-6 xl:grid-cols-2">
                <Specimen name="SegmentedControl" source="ui/SegmentedControl.tsx" notes="Botões com aria-pressed. Use para alternar visualizações, não para navegar.">
                  <SegmentedControlDemo />
                </Specimen>
                <Specimen name="QtyStepper" source="ui/QtyStepper.tsx" notes="O campo aceita apagar e redigitar; vale ao sair ou com Enter. Botões desabilitam nos limites.">
                  <QtyStepperDemo />
                </Specimen>
              </div>

              <Specimen name="AccordionItem" source="ui/Accordion.tsx" notes="Altura animada por grid-template-rows; motion-reduce desliga a animação.">
                <AccordionDemo />
              </Specimen>

              <div className="grid gap-6 xl:grid-cols-2">
                <Specimen name="Dialog" source="ui/Dialog.tsx" notes="useModal: foco inicial no painel, Tab preso, Esc fecha, rolagem travada e foco devolvido.">
                  <DialogDemo />
                </Specimen>
                <Specimen name="Drawer" source="ui/Drawer.tsx" notes="Sempre montada para animar; fechada fica inert e pointer-events-none.">
                  <DrawerDemo />
                </Specimen>
              </div>

              <Specimen name="SectionHeading" source="ui/SectionHeading.tsx" notes="Eyebrow coral-700 no claro e coral no escuro. O título aceita <Marker> para o marca-texto.">
                {/* Na loja é h2; aqui fica em h3 para não quebrar a hierarquia da página. */}
                <SectionHeading
                  eyebrow="Mais vendidos"
                  title={<>Os queridinhos da <Marker>semana</Marker></>}
                  subtitle="Produtos que saem todo dia da gráfica."
                  action={{ href: "/produtos", label: "Ver todos" }}
                  as="h3"
                />
                <div className="on-dark -mx-5 -mb-5 mt-8 bg-ink p-5 text-white md:-mx-7 md:-mb-7 md:p-7">
                  <SectionHeading tone="dark" eyebrow="Mockup 3D" title="Veja antes de imprimir" subtitle="Gire, aproxime e troque a arte em tempo real." action={{ href: "/produtos", label: "Experimentar" }} as="h3" />
                </div>
              </Specimen>

              <Specimen name="Breadcrumb" source="ui/Breadcrumb.tsx" notes="O último item, sem href, recebe aria-current=page.">
                <Breadcrumb
                  items={[
                    { href: "/", label: "Início" },
                    { href: "/produtos", label: "Produtos" },
                    ...(crumbProduct ? [{ href: `/categoria/${crumbProduct.categorySlug}`, label: crumbProduct.category }] : []),
                    { label: crumbProduct?.name ?? "Produto" },
                  ]}
                />
              </Specimen>
            </div>
          </DsSection>

          {/* 09 Padrões */}
          <DsSection id="padroes" index={9} eyebrow="Padrões" title="Composições da loja" intro="Combinações de componentes que se repetem: card de produto, passo do configurador e preço com PIX.">
            <h3 className="text-lg font-bold">ProductCard</h3>
            <p className="mt-1 text-muted">Produtos reais do catálogo. O fundo da foto alterna com os tons -50 do espectro nas vitrines.</p>
            <div className="mt-5 grid grid-cols-1 gap-5 rounded-panel bg-mist p-5 sm:grid-cols-2 md:p-8 lg:grid-cols-3">
              {showcase.map((p, i) => (
                <div key={p.slug} className="mx-auto w-full max-w-[300px]">
                  <ProductCard product={toSummary(p)} tone={i === 0 ? "var(--color-mist)" : cssVar(`color-${SPECTRUM_KEYS[i * 2]}-50`)} />
                </div>
              ))}
            </div>

            <h3 className="mt-14 text-lg font-bold">Passo do configurador</h3>
            <p className="mt-1 text-muted">Opções numeradas (“opção 2 de 4”), chips com o adicional no rótulo e o preço anunciado ao vivo para leitores de tela.</p>
            <div className="mt-5 rounded-panel border border-line bg-white p-5 md:p-8">
              <ConfiguratorDemo />
            </div>

            <h3 className="mt-14 text-lg font-bold">Preço com PIX</h3>
            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-panel bg-coral-50 p-6 md:p-8">
                <Badge tone="pix">{Math.round(PIX_DISCOUNT * 100)}% no PIX</Badge>
                <Price size="pdp" value={samplePrice} unit="por unidade" className="mt-4" />
              </div>
              <div className="rounded-panel border border-line bg-white p-6 text-sm md:p-8">
                <p className="font-bold">Regra</p>
                <ul className="mt-3 grid gap-2 text-muted">
                  <li>
                    PIX = preço × (1 − {PIX_DISCOUNT.toLocaleString("pt-BR")}) → <span className="font-semibold text-ink">{formatBRL(pixPrice(samplePrice))}</span> ({formatBRL(samplePrice)} de tabela)
                  </li>
                  <li>Valor principal em coral (≥ 19px bold); linha do PIX em coral-700 com o percentual em muted.</li>
                  <li>
                    Calcule sempre com <TokenName>pixPrice()</TokenName> de <TokenName>lib/pricing.ts</TokenName>, nunca à mão.
                  </li>
                </ul>
              </div>
            </div>
          </DsSection>

          {/* 10 Mockups 3D */}
          <DsSection
            id="mockups"
            index={10}
            eyebrow="Mockups 3D"
            title={`${MOCKUP_KINDS.length} tipos, ${products.length} produtos`}
            intro={
              <>
                Cada produto resolve um tipo (kind) em <TokenName>lib/mockup.ts</TokenName>: override por slug, regra de nome, padrão da categoria ou fallback. Abra um tipo
                para inspecionar os produtos dele na <Link href="/design-system/mockups" className="font-semibold text-ink underline underline-offset-4">galeria</Link>.
              </>
            }
          >
            <div className="overflow-x-auto rounded-panel border border-line bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line bg-page-cart text-micro uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Produtos</th>
                    <th className="px-4 py-3 font-semibold">Subtipos</th>
                    <th className="px-4 py-3 font-semibold">Medida padrão</th>
                    <th className="px-4 py-3 font-semibold">Cena</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const info = KIND_INFO[row.kind];
                    const [w, h, d] = info.defaultSize;
                    return (
                      <tr key={row.kind} className="hover:bg-page-cart">
                        <td className="px-4 py-2.5">
                          <Link href={`/design-system/mockups?kind=${row.kind}`} className="group inline-flex items-center gap-2 font-semibold">
                            <span className="underline-offset-4 group-hover:underline">{info.label}</span>
                            <code className="text-micro font-normal text-muted">{row.kind}</code>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-3">
                            <span className="w-8 text-right font-bold tabular-nums">{row.count}</span>
                            <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded-full bg-mist">
                              <span className="block h-full rounded-full bg-coral" style={{ width: `${(row.count / maxCount) * 100}%` }} />
                            </span>
                            {row.blank > 0 && <span className="text-micro text-muted">{row.blank} sem impressão</span>}
                            {row.fallback > 0 && <span className="text-micro font-bold text-coral-700">{row.fallback} fallback</span>}
                          </span>
                        </td>
                        <td className="max-w-64 px-4 py-2.5 text-micro leading-snug text-muted">{row.variants.length ? row.variants.join(", ") : "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted">
                          {w} × {h}
                          {d ? ` × ${d}` : ""} cm{info.sizeIsArtArea && <span className="ml-1.5 text-micro">(área de arte)</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-micro font-bold ${info.scene === "dark" ? "bg-night text-white" : "bg-mist text-ink"}`}>
                            {info.scene === "dark" ? "escura" : "clara"}
                          </span>
                          {info.dims && <span className="ml-1.5 text-micro text-muted">cotas</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DsSection>

          {/* 11 Acessibilidade */}
          <DsSection id="acessibilidade" index={11} eyebrow="Acessibilidade" title="Checklist antes de publicar" intro="Regras que todo componente novo segue. As demos desta página cumprem todas.">
            <ul className="grid gap-4 md:grid-cols-2">
              <A11yItem title="Foco sempre visível">
                <p>
                  <TokenName>:focus-visible</TokenName> desenha um contorno de 2px na cor <TokenName>--color-focus</TokenName> (ink). Dentro de <TokenName>on-dark</TokenName> ele fica
                  branco. Nunca remova o outline sem substituto.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button variant="outline" size="sm">
                    Foque com Tab
                  </Button>
                  <span className="on-dark rounded-full bg-ink p-1.5">
                    <Button variant="light" size="sm">
                      Foco no escuro
                    </Button>
                  </span>
                </div>
              </A11yItem>
              <A11yItem title="Link “Pular para o conteúdo”">
                <p>
                  Primeiro item focável do layout da loja, aponta para <TokenName>#conteudo</TokenName> (o <TokenName>main</TokenName> com tabIndex −1). Esta página tem o
                  seu: aperte Tab no topo.
                </p>
              </A11yItem>
              <A11yItem title="Contraste">
                <p>
                  Texto comum ≥ 4,5:1. <strong className="text-ink">Branco sobre coral ({formatRatio(contrast(WHITE, hexOf("coral")))}) só em texto ≥ 19px bold</strong>; abaixo
                  disso, coral-700. Subtle só em texto grande, ícones e bordas.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="buy">Comprar · 19px bold</Button>
                  <Button variant="buy" size="sm">
                    Comprar · sm vira coral-700
                  </Button>
                </div>
              </A11yItem>
              <A11yItem title="Gavetas e acordeões inert">
                <p>
                  Fechados continuam no DOM para animar, mas com <TokenName>inert</TokenName>: saem do Tab e dos leitores de tela. Modais prendem o foco e devolvem para quem
                  abriu (<TokenName>useModal</TokenName>).
                </p>
              </A11yItem>
              <A11yItem title="Movimento reduzido">
                <p>
                  Toda animação tem saída para <TokenName>prefers-reduced-motion</TokenName>: classes globais desligadas no CSS, <TokenName>motion-reduce:transition-none</TokenName>{" "}
                  nos componentes e o 3D para de girar sozinho.
                </p>
              </A11yItem>
              <A11yItem title="Alvos de toque ≥ 24px">
                <p>WCAG 2.2 pede 24 × 24px no mínimo; a loja mira 44px. Botões sm têm 44px, chips min-h-11, IconButton sm 36px.</p>
                <div className="mt-3 flex items-end gap-3" aria-hidden>
                  {[24, 36, 44].map((size) => (
                    <span key={size} className="grid place-items-center rounded-full bg-ink text-[11px] font-bold text-white" style={{ width: size, height: size }}>
                      {size}
                    </span>
                  ))}
                </div>
              </A11yItem>
            </ul>
          </DsSection>
        </div>
      </div>
    </div>
  );
}

function A11yItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-panel border border-line bg-white p-5 md:p-6">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white">
        <IconCheck className="size-4" strokeWidth={2.6} />
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-muted">
        <h3 className="mb-1.5 text-base font-bold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}
