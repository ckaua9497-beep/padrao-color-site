"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { Marquee } from "@/components/motion";
import { IconArrow, IconBag, IconChevron, IconClose, IconCube, IconHeadset, IconMenu, IconSearch } from "@/components/icons";
import { useCart } from "@/components/cart/CartProvider";
import { formatBRL, imageUrl, spectrumAt } from "@/lib/format";

export type MenuCategory = { slug: string; name: string; count: number; image: string; minLeadDays: number | null };
export type MenuGroup = { label: string; blurb: string; categories: MenuCategory[] };

type SearchEntry = { s: string; n: string; c: string; i: string; p: number; q: number };

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function SiteHeader({ menu, announcements }: { menu: MenuGroup[]; announcements: string[] }) {
  const pathname = usePathname();
  const { count, setOpen: openCart } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      <div className="bg-coral text-white">
        <Marquee
          className="h-9 items-center text-[13px] font-semibold"
          itemClassName="gap-6 pr-6"
          items={announcements.map((text, i) => (
            <>
              <span key={`t${i}`}>{text}</span>
              <span key={`d${i}`} className="size-1.5 rounded-full" style={{ background: spectrumAt(i + 1).solid }} />
            </>
          ))}
        />
      </div>

      <header
        className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${scrolled || openGroup !== null ? "shadow-header" : ""}`}
        onMouseLeave={leave}
      >
        <div className="mx-auto flex h-[84px] max-w-[1440px] items-center gap-6 px-5 md:px-10 xl:px-[70px]">
          <Logo />

          <nav aria-label="Menu principal" className="hidden flex-1 items-center gap-0.5 xl:flex">
            {menu.map((group, i) => (
              <div key={group.label} onMouseEnter={() => enter(i)}>
                <button
                  type="button"
                  aria-expanded={openGroup === i}
                  onClick={() => setOpenGroup(openGroup === i ? null : i)}
                  onFocus={() => setOpenGroup(i)}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors duration-200 ${
                    activeGroup === i ? "bg-ink text-white" : openGroup === i ? "bg-mist" : "hover:bg-mist"
                  }`}
                >
                  {group.label}
                  <IconChevron className={`size-4 transition-transform duration-300 ${openGroup === i ? "rotate-180" : ""}`} />
                </button>
              </div>
            ))}
            <Link
              href="/#mockup-3d"
              onMouseEnter={leave}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors hover:bg-mist"
            >
              <IconCube className="size-4 text-coral" />
              Mockup 3D
            </Link>
            <Link
              href="/produtos"
              onMouseEnter={leave}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors ${pathname === "/produtos" ? "bg-ink text-white" : "hover:bg-mist"}`}
            >
              Todos os produtos
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-1 xl:ml-0">
            <button type="button" onClick={() => setSearchOpen((v) => !v)} aria-label="Buscar produtos" className="grid size-11 place-items-center rounded-full transition-colors hover:bg-mist">
              <IconSearch className="size-[22px]" />
            </button>
            <a href="https://api.whatsapp.com/send?phone=5521971148565" target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-full px-3 py-2 text-[15px] font-semibold transition-colors hover:bg-mist xl:flex">
              <IconHeadset className="size-5" />
              Ajuda
            </a>
            <button type="button" onClick={() => openCart(true)} aria-label={`Abrir carrinho, ${count} itens`} className="relative grid size-11 place-items-center rounded-full transition-colors hover:bg-mist">
              <IconBag className="size-[22px]" />
              {count > 0 && (
                <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold leading-5 text-white">{count}</span>
              )}
            </button>
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="grid size-11 place-items-center rounded-full transition-colors hover:bg-mist xl:hidden">
              <IconMenu className="size-6" />
            </button>
          </div>
        </div>

        {menu.map((group, i) => (
          <MegaPanel key={group.label} group={group} index={i} open={openGroup === i} onEnter={() => enter(i)} />
        ))}

        <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} menu={menu} />
    </>
  );
}

function MegaPanel({ group, index, open, onEnter }: { group: MenuGroup; index: number; open: boolean; onEnter: () => void }) {
  const cover = group.categories[0];
  const tone = spectrumAt(index + 1);
  return (
    <div
      onMouseEnter={onEnter}
      className={`absolute inset-x-0 top-full hidden px-5 transition-all duration-300 ease-button xl:block md:px-10 xl:px-[70px] ${
        open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-[1100px] gap-8 rounded-[16px] bg-white p-5 shadow-menu">
        <Link
          href={`/categoria/${cover.slug}`}
          className="group relative flex w-[280px] shrink-0 flex-col justify-end overflow-hidden rounded-control p-5"
          style={{ background: tone.soft }}
        >
          <Image src={imageUrl(cover.image)} alt="" width={260} height={260} className="absolute -right-6 -top-4 size-[230px] object-contain transition-transform duration-500 ease-card group-hover:scale-105" />
          <p className="relative text-lg font-bold leading-tight">{group.label}</p>
          <p className="relative mt-1 text-[13px] text-ink/70">{group.blurb}</p>
          <span className="relative mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-bold">
            Ver {cover.name.toLowerCase()} <IconArrow className="size-4" />
          </span>
        </Link>
        <ul className="grid flex-1 grid-cols-2 content-start gap-x-6 gap-y-1 py-2">
          {group.categories.map((cat, i) => (
            <li key={cat.slug}>
              <Link href={`/categoria/${cat.slug}`} className="group flex items-center gap-3 rounded-control p-2.5 transition-colors hover:bg-mist">
                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px]" style={{ background: spectrumAt(i + index).soft }}>
                  <Image src={imageUrl(cat.image)} alt="" width={48} height={48} className="size-11 object-contain transition-transform duration-300 group-hover:scale-110" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">{cat.name}</span>
                  <span className="block text-[12px] text-muted">
                    {cat.count} produtos{cat.minLeadDays ? ` · a partir de ${cat.minLeadDays} ${cat.minLeadDays === 1 ? "dia" : "dias"}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
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

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    if (!index) fetch("/search-index.json").then((r) => r.json()).then(setIndex).catch(() => setIndex([]));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, onClose]);

  const results = useMemo(() => {
    const words = normalize(term).split(/\s+/).filter(Boolean);
    if (!index || words.length === 0) return [];
    return index.filter((e) => words.every((w) => normalize(`${e.n} ${e.c}`).includes(w))).slice(0, 8);
  }, [index, term]);

  return (
    <div className={`absolute inset-x-0 top-full border-t border-line bg-white transition-all duration-300 ease-button ${open ? "visible opacity-100 shadow-header" : "invisible -translate-y-2 opacity-0"}`}>
      <form
        className="mx-auto max-w-[1100px] px-5 py-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) router.push(`/produtos?busca=${encodeURIComponent(term.trim())}`);
        }}
      >
        <div className="flex items-center gap-3 rounded-full bg-mist px-5">
          <IconSearch className="size-5 text-muted" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="O que você quer imprimir? Ex.: cartão de visita, caneca, banner"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
            aria-label="Buscar produtos"
          />
          <button type="button" onClick={onClose} aria-label="Fechar busca" className="grid size-9 place-items-center rounded-full hover:bg-white">
            <IconClose className="size-4" />
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {results.map((r) => (
              <li key={r.s}>
                <Link href={`/produto/${r.s}`} className="group flex items-center gap-3 rounded-control p-2 transition-colors hover:bg-mist">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-[10px] bg-mist">
                    <Image src={imageUrl(r.i)} alt="" fill sizes="56px" className="object-contain p-1" />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-coral">{r.n}</span>
                    <span className="text-[12px] text-muted">a partir de {formatBRL(r.p)}</span>
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
    <div className={`fixed inset-0 z-[90] xl:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-ink/80 transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute right-0 top-0 flex h-full w-[340px] max-w-[88vw] flex-col overflow-y-auto bg-ink p-7 text-white transition-transform duration-700 ease-drawer ${open ? "translate-x-0" : "translate-x-full"}`}>
        <button type="button" onClick={onClose} aria-label="Fechar menu" className="ml-auto grid size-10 place-items-center rounded-full bg-white/10">
          <IconClose className="size-5" />
        </button>
        <nav className="mt-6 flex flex-col gap-1">
          {menu.map((group, i) => (
            <div key={group.label} className="border-b border-white/10">
              <button type="button" onClick={() => setExpanded(expanded === i ? null : i)} className="flex w-full items-center justify-between py-4 text-xl font-bold">
                {group.label}
                <IconChevron className={`size-5 transition-transform ${expanded === i ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-500 ease-button ${expanded === i ? "grid-rows-[1fr] pb-4" : "grid-rows-[0fr]"}`}>
                <ul className="overflow-hidden">
                  {group.categories.map((cat) => (
                    <li key={cat.slug}>
                      <Link href={`/categoria/${cat.slug}`} className="block py-2 text-[15px] text-white/75 hover:text-white">
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          <Link href="/#mockup-3d" className="py-4 text-xl font-bold">
            Mockup 3D <span className="ml-2 rounded-full bg-coral px-2 py-0.5 align-middle text-[11px]">NOVO</span>
          </Link>
          <Link href="/produtos" className="py-4 text-xl font-bold">
            Todos os produtos
          </Link>
        </nav>
      </aside>
    </div>
  );
}
