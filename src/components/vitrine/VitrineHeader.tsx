"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { IconBag, IconSearch, IconWhatsApp } from "@/components/icons";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";

export type VitrineNavCategory = { slug: string; name: string };

type Props = {
  name: string;
  logo: string | null;
  whatsapp: string | null;
  categories: VitrineNavCategory[];
};

const navItem = "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[15px] font-bold transition-colors";

/** Topo da loja do lojista: marca, busca, WhatsApp, carrinho e as categorias que ele vende. */
export default function VitrineHeader({ name, logo, whatsapp, categories }: Props) {
  const { count, setOpen } = useCart();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCategory = pathname === "/produtos" ? params.get("categoria") : null;

  return (
    <header className="sticky top-0 z-header border-b border-line bg-white">
      <div className="container-site flex h-[76px] items-center gap-4 md:h-header md:gap-8">
        <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3" aria-label={`${name}: página inicial`}>
          {logo ? (
            <Image src={logo} alt="" width={56} height={56} unoptimized className="size-11 rounded-thumb object-contain md:size-14" />
          ) : (
            <span aria-hidden className="grid size-11 place-items-center rounded-thumb bg-buy text-xl font-black text-white md:size-14">
              {name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="max-w-[40vw] truncate text-lg font-black tracking-tight md:max-w-xs md:text-xl">{name}</span>
        </Link>

        <form action="/produtos" role="search" className="relative hidden flex-1 md:block">
          <label htmlFor="vitrine-busca" className="sr-only">
            Buscar produtos
          </label>
          <input
            id="vitrine-busca"
            name="q"
            type="search"
            defaultValue={pathname === "/produtos" ? (params.get("q") ?? "") : ""}
            placeholder="O que você quer personalizar?"
            className="h-12 w-full rounded-full border border-line bg-mist pl-5 pr-12 text-body placeholder:text-muted focus:border-ink focus:bg-white"
          />
          <button type="submit" aria-label="Buscar" className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-ink text-white hover:bg-coral-700">
            <IconSearch aria-hidden className="size-4.5" />
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/produtos" aria-label="Buscar produtos" className="grid size-11 place-items-center rounded-full hover:bg-mist md:hidden">
            <IconSearch aria-hidden className="size-5.5" />
          </Link>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp" title="Falar no WhatsApp" className="grid size-11 place-items-center rounded-full hover:bg-mist">
              <IconWhatsApp aria-hidden className="size-5.5" />
            </a>
          )}
          <IconButton label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`} variant="ghost" onClick={() => setOpen(true)} className="relative hover:bg-mist">
            <IconBag className="size-5.5" />
            {count > 0 && (
              <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold leading-5 text-white">
                {count}
              </span>
            )}
          </IconButton>
        </div>
      </div>

      {categories.length > 0 && (
        <nav aria-label="Categorias" className="border-t border-line">
          <div className="container-site flex h-14 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            <Link href="/produtos" aria-current={pathname === "/produtos" && !activeCategory ? "page" : undefined} className={cx(navItem, pathname === "/produtos" && !activeCategory && !params.get("q") ? "bg-ink text-white" : "hover:bg-mist")}>
              Todos
            </Link>
            {categories.map((c) => {
              const active = activeCategory === c.slug;
              return (
                <Link key={c.slug} href={`/produtos?categoria=${c.slug}`} aria-current={active ? "page" : undefined} className={cx(navItem, active ? "bg-ink text-white" : "hover:bg-mist")}>
                  {c.name}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
