"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import Logo from "@/components/Logo";
import { IconArrow, IconBalloon, IconBag, IconChevron, IconClock, IconClose, IconCube, IconGift, IconHeadset, IconLayers, IconMenu, IconShield, IconStorefront, IconTruck, IconUpload, IconWhatsApp } from "@/components/icons";
import { useCart } from "@/components/cart/CartProvider";
import { AccordionItem } from "@/components/ui/Accordion";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { imageUrl, spectrumAt } from "@/lib/format";
import type { BenefitIcon, MenuBenefit, TabIcon } from "@/lib/menu";
import { EXTRA_TABS } from "@/lib/menu";
import { STORE } from "@/lib/store";
import { BuscaTopo, PainelBusca } from "./Busca";
import { ContaLink } from "./ContaLink";
import { FaixaCupom } from "./FaixaCupom";
import { IconCarrinho, IconGrade, IconLupa } from "./icones";

export type MenuCategory = { slug: string; name: string; count: number; image: string; minLeadDays: number | null };
export type MenuGroup = { label: string; blurb: string; categories: MenuCategory[]; benefits: MenuBenefit[]; more?: { href: string; label: string } };

const TAB_ICONS: Record<TabIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  balloon: IconBalloon,
  gift: IconGift,
  store: IconStorefront,
  bag: IconBag,
};

const BENEFIT_ICONS: Record<BenefitIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  cube: IconCube,
  clock: IconClock,
  layers: IconLayers,
  shield: IconShield,
  truck: IconTruck,
  upload: IconUpload,
  headset: IconHeadset,
};

/**
 * Mesma largura do conteúdo das páginas (container-site, globals.css): a partir de 1280 px, margens de 108 px (logo em
 * x = 108 e conteúdo de 1064 px a 1280, como no Figma) até o conteúdo chegar a 1300 px; abaixo disso, margens de
 * 20 px (celular) e 40 px (tablet). Nada no topo depende de 1064: a busca tem largura máxima e os ícones ficam
 * presos à direita.
 */
const LARGURA = "container-site";

// Linha do menu (Figma: faixa cinza com itens de 14px escuros e setinha).
const itemMenu = "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition-colors duration-200";
// Linha das abas (festa, kit, fachadas, produtos novos).
const navItem = "flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-2 text-[14px] font-bold transition-colors duration-200 min-[1440px]:px-3.5 min-[1440px]:text-[15px] 2xl:text-nav";

/**
 * Topo da loja (Figma "LOJA ONLINE - PADRAOCOLOR"):
 * 1. faixa laranja do cupom (rola com a página);
 * 2. linha presa: logo, busca em pílula (a partir de lg; abaixo, a lupa abre o painel), conta e carrinho;
 * 3. linha presa do menu de categorias com os mega-menus (a partir de xl; abaixo, a gaveta do hambúrguer);
 * 4. abas de festa, kit, fachadas e produtos novos (rolam com a página).
 * A parte presa mede var(--spacing-topo): 92px, ou 136px com a linha do menu (globals.css).
 */
export default function SiteHeader({ menu }: { menu: MenuGroup[] }) {
  const pathname = usePathname();
  const { count, setOpen: openCart } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const lupa = useRef<HTMLButtonElement>(null);

  // Painel de busca fechado (Esc, X, Enter ou toque num resultado): o foco volta para a lupa que o abriu, senão cairia
  // no body junto com o painel que some.
  const fecharBusca = () => {
    setSearchOpen(false);
    lupa.current?.focus();
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Esc fecha o mega menu e devolve o foco ao botão do grupo.
  useEffect(() => {
    if (openGroup === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      triggers.current[openGroup]?.focus();
      setOpenGroup(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openGroup]);

  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpenGroup(null);
    setMobileOpen(false);
    setSearchOpen(false);
  }

  const activeGroup = menu.findIndex((g) => g.categories.some((c) => pathname.startsWith(`/categoria/${c.slug}`)));

  const enter = (i: number) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenGroup(i), 90);
  };
  const leave = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenGroup(null), 160);
  };
  // Ponteiro na linha do logo ou foco na busca: o mega menu (que abre abaixo da linha do menu) fecha na hora.
  const closeNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpenGroup(null);
  };

  return (
    <>
      <FaixaCupom />

      <header
        className={cx("sticky top-0 z-header bg-white transition-shadow duration-300", (scrolled || openGroup !== null) && "shadow-header")}
        onMouseLeave={leave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenGroup(null);
        }}
      >
        <div onMouseEnter={closeNow}>
          <div className={cx(LARGURA, "flex h-header items-center gap-2 min-[360px]:gap-3 lg:gap-6 xl:gap-[39px]")}>
            <Logo />

            <BuscaTopo onFocus={closeNow} className="hidden min-w-0 flex-1 lg:block xl:max-w-[732px]" />

            {/*
              Ícones presos à direita do conteúdo em qualquer largura. A margem negativa alinha o desenho (não a área de
              toque de 44 px) com a borda: o traço do hambúrguer fica a 14 px da borda do botão e o carrinho, a 4 px.
            */}
            <div className="-mr-3.5 ml-auto flex items-center gap-0.5 lg:gap-2 xl:-mr-1 xl:gap-5">
              <button
                ref={lupa}
                type="button"
                aria-label="Buscar produtos"
                title="Buscar produtos"
                aria-expanded={searchOpen}
                aria-controls="busca"
                onClick={() => setSearchOpen((v) => !v)}
                className="grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-ink/5 lg:hidden"
              >
                <IconLupa className="size-6" />
              </button>
              <ContaLink />
              <IconButton label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`} variant="ghost" onClick={() => openCart(true)} className="relative">
                <IconCarrinho className="size-7 lg:size-9" />
                {count > 0 && (
                  <span aria-hidden className="absolute -right-0.5 top-0 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold leading-5 text-ink">
                    {count}
                  </span>
                )}
              </IconButton>
              <IconButton
                label="Abrir menu"
                variant="ghost"
                aria-expanded={mobileOpen}
                aria-controls="menu-mobile"
                onClick={() => {
                  setSearchOpen(false);
                  setMobileOpen(true);
                }}
                className="xl:hidden"
              >
                <IconMenu className="size-6" />
              </IconButton>
            </div>
          </div>
        </div>

        <nav aria-label="Menu principal" className="hidden h-menu-topo border-t border-line bg-mist xl:block">
          <ul className={cx(LARGURA, "flex h-full items-center justify-between")}>
            <li>
              <Link
                href="/produtos"
                onMouseEnter={leave}
                aria-current={pathname === "/produtos" ? "page" : undefined}
                className={cx(itemMenu, "-ml-3", pathname === "/produtos" ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}
              >
                <IconGrade aria-hidden className="size-[18px]" />
                Todos os produtos
              </Link>
            </li>
            {menu.map((group, i) => (
              <li key={group.label} onMouseEnter={() => enter(i)}>
                <button
                  ref={(node) => {
                    triggers.current[i] = node;
                  }}
                  type="button"
                  aria-expanded={openGroup === i}
                  aria-controls={`mega-${i}`}
                  onClick={() => setOpenGroup(openGroup === i ? null : i)}
                  className={cx(itemMenu, activeGroup === i ? "bg-ink text-white" : openGroup === i ? "bg-white text-ink" : "text-ink-soft hover:bg-white")}
                >
                  {group.label}
                  <IconChevron aria-hidden className={cx("size-3.5 transition-transform duration-300", openGroup === i && "rotate-180")} />
                </button>
              </li>
            ))}
            <li>
              <Link href="/#mockup-3d" onMouseEnter={leave} className={cx(itemMenu, "-mr-3 text-ink-soft hover:bg-white")}>
                <IconCube aria-hidden className="size-[18px] text-coral-700" />
                Mockup 3D
              </Link>
            </li>
          </ul>
        </nav>

        {menu.map((group, i) => (
          <MegaPanel key={group.label} id={`mega-${i}`} group={group} index={i} open={openGroup === i} onEnter={() => enter(i)} />
        ))}

        <PainelBusca open={searchOpen} onClose={fecharBusca} />
      </header>

      <nav aria-label="Festas, kits e fachadas" className="hidden border-b border-line bg-white xl:block">
        <div className={cx(LARGURA, "flex h-12 items-center gap-1")}>
          {EXTRA_TABS.map((tab, i) => {
            const Icon = TAB_ICONS[tab.icon];
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={pathname === tab.href ? "page" : undefined}
                className={cx(navItem, "gap-2", i === 0 && "-ml-2.5 min-[1440px]:-ml-3.5", active ? "bg-ink text-white" : "hover:bg-mist")}
              >
                <Icon aria-hidden className={cx("size-[18px]", active ? "text-white" : "text-coral-700")} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} menu={menu} />
    </>
  );
}

function MegaPanel({ id, group, index, open, onEnter }: { id: string; group: MenuGroup; index: number; open: boolean; onEnter: () => void }) {
  const cover = group.categories[0];
  const tone = spectrumAt(index + 1);
  return (
    <div
      id={id}
      onMouseEnter={onEnter}
      className={cx("container-site absolute inset-x-0 top-full hidden transition-all duration-300 ease-button xl:block", open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0")}
    >
      <div className="flex gap-8 rounded-menu bg-white p-5 shadow-menu">
        {/*
          A imagem fica no fluxo, acima do texto: as fotos redondas das categorias (admin → Site) cobriam o título quando
          eram absolutas e o cartão era baixo (grupo com poucas categorias).
        */}
        {cover && (
          <Link href={`/categoria/${cover.slug}`} className="group flex w-[260px] shrink-0 flex-col overflow-hidden rounded-control p-5" style={{ background: tone.soft }}>
            <Image src={imageUrl(cover.image)} alt="" width={260} height={260} className="-mr-3 -mt-3 mb-3 ml-auto size-[160px] object-contain transition-transform duration-500 ease-card group-hover:scale-105" />
            <p className="mt-auto text-lg font-bold leading-tight">{group.label}</p>
            <p className="mt-1 text-caption text-ink/75">{group.blurb}</p>
            <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-caption font-bold">
              Ver {cover.name.toLowerCase()} <IconArrow aria-hidden className="size-4" />
            </span>
          </Link>
        )}
        <ul className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-1 py-2">
          {group.categories.map((cat, i) => (
            <li key={cat.slug}>
              <Link href={`/categoria/${cat.slug}`} className="group flex items-center gap-3 rounded-control p-2.5 transition-colors hover:bg-mist">
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-thumb" style={{ background: spectrumAt(i + index).soft }}>
                  <Image src={imageUrl(cat.image)} alt="" width={48} height={48} className="size-11 object-contain transition-transform duration-300 group-hover:scale-110" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">{cat.name}</span>
                  <span className="block text-caption text-muted">
                    {cat.count} produtos{cat.minLeadDays ? ` · a partir de ${cat.minLeadDays} ${cat.minLeadDays === 1 ? "dia" : "dias"}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {group.more && (
            <li className="col-span-2 pt-2">
              <Link href={group.more.href} className="inline-flex items-center gap-2 rounded-control p-2.5 text-[15px] font-bold transition-colors hover:bg-mist">
                {group.more.label} <IconArrow aria-hidden className="size-4" />
              </Link>
            </li>
          )}
        </ul>
        <ul className="grid w-[230px] shrink-0 content-start gap-4 border-l border-line py-2 pl-6" aria-label={`Vantagens de ${group.label}`}>
          {group.benefits.map((benefit) => {
            const Icon = BENEFIT_ICONS[benefit.icon];
            return (
              <li key={benefit.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mist">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block text-[15px] font-bold leading-tight">{benefit.title}</span>
                  <span className="block text-caption text-muted">{benefit.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function MobileMenu({ open, onClose, menu }: { open: boolean; onClose: () => void; menu: MenuGroup[] }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  return (
    <Drawer open={open} onClose={onClose} label="Menu" tone="dark" width="w-[340px]" className="xl:hidden">
      <div id="menu-mobile" className="flex h-full flex-col overflow-y-auto p-7">
        <IconButton label="Fechar menu" variant="ghost" onClick={onClose} className="ml-auto bg-white/10 hover:bg-white/20">
          <IconClose className="size-5" />
        </IconButton>
        <nav aria-label="Menu principal" className="mt-6 flex flex-col">
          {menu.map((group, i) => (
            <AccordionItem
              key={group.label}
              title={group.label}
              open={expanded === i}
              onToggle={() => setExpanded(expanded === i ? null : i)}
              buttonClassName="py-4 text-xl font-bold"
              className="border-b border-white/10"
            >
              <ul className="pb-4">
                {group.categories.map((cat) => (
                  <li key={cat.slug}>
                    <Link href={`/categoria/${cat.slug}`} className="block py-2 text-[15px] text-white/80 hover:text-white">
                      {cat.name}
                    </Link>
                  </li>
                ))}
                {group.more && (
                  <li>
                    <Link href={group.more.href} className="block py-2 text-[15px] font-semibold text-white hover:underline">
                      {group.more.label}
                    </Link>
                  </li>
                )}
              </ul>
            </AccordionItem>
          ))}
          <Link href="/#mockup-3d" className="py-4 text-xl font-bold">
            Mockup 3D <span className="ml-2 rounded-full bg-coral px-2 py-0.5 align-middle text-[11px] text-ink">NOVO</span>
          </Link>
          <Link href="/produtos" className="py-4 text-xl font-bold">
            Todos os produtos
          </Link>
          {EXTRA_TABS.map((tab) => (
            <Link key={tab.href} href={tab.href} className="py-4 text-xl font-bold">
              {tab.label}
            </Link>
          ))}
          <Link href="/conta" className="py-4 text-xl font-bold">
            Minha conta
          </Link>
        </nav>
        {/* Alvos de toque de 44 px. */}
        <div className="mt-auto grid gap-1 pt-8 text-[15px]">
          <a href={STORE.whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 font-semibold hover:underline">
            <IconWhatsApp aria-hidden className="size-5" /> Ajuda pelo WhatsApp
          </a>
          <a href={STORE.phoneHref} className="flex min-h-11 items-center text-white/80 hover:text-white">
            {STORE.phone} · {STORE.hours}
          </a>
        </div>
      </div>
    </Drawer>
  );
}
