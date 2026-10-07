"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from "react";
import Logo from "@/components/Logo";
import { Marquee } from "@/components/motion";
import { IconArrow, IconBag, IconChevron, IconClock, IconClose, IconCube, IconHeadset, IconLayers, IconMenu, IconSearch, IconShield, IconTruck, IconUpload, IconWhatsApp } from "@/components/icons";
import { useCart } from "@/components/cart/CartProvider";
import { AccordionItem } from "@/components/ui/Accordion";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { formatBRL, imageUrl, spectrumAt } from "@/lib/format";
import type { BenefitIcon, MenuBenefit } from "@/lib/menu";
import { EXTRA_TABS } from "@/lib/menu";
import { STORE } from "@/lib/store";
import { AccountLink } from "@/components/account/AccountLink";

export type MenuCategory = { slug: string; name: string; count: number; image: string; minLeadDays: number | null };
export type MenuGroup = { label: string; blurb: string; categories: MenuCategory[]; benefits: MenuBenefit[] };

type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number };

const BENEFIT_ICONS: Record<BenefitIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  cube: IconCube,
  clock: IconClock,
  layers: IconLayers,
  shield: IconShield,
  truck: IconTruck,
  upload: IconUpload,
  headset: IconHeadset,
};

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const navItem = "flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-bold transition-colors duration-200 2xl:text-nav";

export default function SiteHeader({ menu, announcements }: { menu: MenuGroup[]; announcements: string[] }) {
  const pathname = usePathname();
  const { count, setOpen: openCart } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);

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

  return (
    <>
      {/* Texto pequeno sobre coral: preto passa AA (6,2:1); branco não passaria. */}
      <div className="bg-coral text-ink">
        <Marquee
          className="h-9 items-center text-[13px] font-semibold"
          itemClassName="gap-6 pr-6"
          items={announcements.map((text, i) => (
            <>
              <span key={`t${i}`}>{text}</span>
              <span key={`d${i}`} aria-hidden className="size-1.5 rounded-full bg-ink/40" />
            </>
          ))}
        />
      </div>

      <header
        className={cx("sticky top-0 z-header bg-white transition-shadow duration-300", (scrolled || openGroup !== null) && "shadow-header")}
        onMouseLeave={leave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenGroup(null);
        }}
      >
        <div className="container-site flex h-header items-center gap-6">
          <Logo />

          <nav aria-label="Menu principal" className="hidden flex-1 items-center gap-0.5 xl:flex">
            {menu.map((group, i) => (
              <div key={group.label} onMouseEnter={() => enter(i)}>
                <button
                  ref={(node) => {
                    triggers.current[i] = node;
                  }}
                  type="button"
                  aria-expanded={openGroup === i}
                  aria-controls={`mega-${i}`}
                  onClick={() => setOpenGroup(openGroup === i ? null : i)}
                  className={cx(navItem, activeGroup === i ? "bg-ink text-white" : openGroup === i ? "bg-mist" : "hover:bg-mist")}
                >
                  {group.label}
                  <IconChevron aria-hidden className={cx("size-4 transition-transform duration-300", openGroup === i && "rotate-180")} />
                </button>
              </div>
            ))}
            <Link href="/#mockup-3d" onMouseEnter={leave} className={cx(navItem, "hover:bg-mist")}>
              <IconCube aria-hidden className="size-4 text-coral-700" />
              Mockup 3D
            </Link>
            <Link href="/produtos" onMouseEnter={leave} aria-current={pathname === "/produtos" ? "page" : undefined} className={cx(navItem, pathname === "/produtos" ? "bg-ink text-white" : "hover:bg-mist")}>
              Todos os produtos
            </Link>
            {EXTRA_TABS.map((tab) => (
              <Link key={tab.href} href={tab.href} onMouseEnter={leave} aria-current={pathname === tab.href ? "page" : undefined} className={cx(navItem, "hidden 2xl:flex", pathname === tab.href ? "bg-ink text-white" : "hover:bg-mist")}>
                {tab.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 xl:ml-0">
            <IconButton label="Buscar produtos" variant="ghost" aria-expanded={searchOpen} aria-controls="busca" onClick={() => setSearchOpen((v) => !v)} className="hover:bg-mist">
              <IconSearch className="size-5.5" />
            </IconButton>
            <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full px-3 py-2 text-[15px] font-bold transition-colors hover:bg-mist xl:flex">
              <IconHeadset aria-hidden className="size-5" />
              Ajuda
            </a>
            <AccountLink />
            <IconButton label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`} variant="ghost" onClick={() => openCart(true)} className="relative hover:bg-mist">
              <IconBag className="size-5.5" />
              {count > 0 && (
                <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold leading-5 text-ink">
                  {count}
                </span>
              )}
            </IconButton>
            <IconButton label="Abrir menu" variant="ghost" aria-expanded={mobileOpen} aria-controls="menu-mobile" onClick={() => setMobileOpen(true)} className="hover:bg-mist xl:hidden">
              <IconMenu className="size-6" />
            </IconButton>
          </div>
        </div>

        {menu.map((group, i) => (
          <MegaPanel key={group.label} id={`mega-${i}`} group={group} index={i} open={openGroup === i} onEnter={() => enter(i)} />
        ))}

        <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
      </header>

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
      <div className="mx-auto flex max-w-[1180px] gap-8 rounded-menu bg-white p-5 shadow-menu">
        {cover && (
          <Link href={`/categoria/${cover.slug}`} className="group relative flex w-[260px] shrink-0 flex-col justify-end overflow-hidden rounded-control p-5" style={{ background: tone.soft }}>
            <Image src={imageUrl(cover.image)} alt="" width={260} height={260} className="absolute -right-6 -top-4 size-[220px] object-contain transition-transform duration-500 ease-card group-hover:scale-105" />
            <p className="relative text-lg font-bold leading-tight">{group.label}</p>
            <p className="relative mt-1 text-caption text-ink/75">{group.blurb}</p>
            <span className="relative mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-caption font-bold">
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

function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Foco só quando a busca abre (antes o efeito rodava a cada render e roubava o foco).
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || index) return;
    fetch("/search-index.json")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex([]));
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    const words = normalize(term).split(/\s+/).filter(Boolean);
    if (!index || words.length === 0) return [];
    return index.filter((e) => words.every((w) => normalize(`${e.n} ${e.c}`).includes(w))).slice(0, 8);
  }, [index, term]);

  return (
    <div id="busca" className={cx("absolute inset-x-0 top-full border-t border-line bg-white transition-all duration-300 ease-button", open ? "visible opacity-100 shadow-header" : "invisible -translate-y-2 opacity-0")}>
      <form
        role="search"
        className="mx-auto max-w-[1100px] px-5 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) router.push(`/produtos?busca=${encodeURIComponent(term.trim())}`);
        }}
      >
        <div className="flex items-center gap-3 rounded-full bg-mist px-5 focus-within:ring-2 focus-within:ring-ink">
          <IconSearch aria-hidden className="size-5 text-muted" />
          <input
            ref={input}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="O que você quer imprimir? Ex.: cartão de visita, caneca, banner"
            className="h-14 flex-1 bg-transparent text-base placeholder:text-muted focus-visible:outline-none"
            aria-label="Buscar produtos"
          />
          <IconButton label="Fechar busca" variant="ghost" size="sm" onClick={onClose} className="hover:bg-white">
            <IconClose className="size-4" />
          </IconButton>
        </div>
        <p aria-live="polite" className="sr-only">
          {term.trim() && index ? `${results.length} produtos encontrados` : ""}
        </p>
        {results.length > 0 && (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {results.map((r) => (
              <li key={r.s}>
                <Link href={`/produto/${r.s}`} className="group flex items-center gap-3 rounded-control p-2 transition-colors hover:bg-mist">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-thumb bg-mist">
                    <Image src={imageUrl(r.i)} alt="" fill sizes="56px" className="object-contain p-1" />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-caption font-semibold leading-snug group-hover:underline">{r.n}</span>
                    <span className="text-caption text-muted">a partir de {formatBRL(r.p)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {term.trim() && index && results.length === 0 && <p className="mt-5 text-sm text-muted">Nenhum produto encontrado para “{term}”.</p>}
      </form>
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
        <div className="mt-auto grid gap-2 pt-8 text-[15px]">
          <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-semibold">
            <IconWhatsApp aria-hidden className="size-5" /> Ajuda pelo WhatsApp
          </a>
          <a href={STORE.phoneHref} className="text-white/80">
            {STORE.phone} · {STORE.hours}
          </a>
        </div>
      </div>
    </Drawer>
  );
}
