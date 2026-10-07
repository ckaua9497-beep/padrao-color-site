import Image from "next/image";
import Link from "next/link";
import { IconArrow, IconClock } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { imageUrl } from "@/lib/format";

export type KitCardData = {
  slug: string;
  name: string;
  tagline: string;
  audience: string;
  image: string;
  colors: string[];
  total: number;
  leadDays: number | null;
  /** Composição resumida ("Painel principal em lona · 200 × 150 cm"). */
  summary: string[];
};

const VISIBLE_ITEMS = 5;

/**
 * Card do kit na vitrine do Monte Seu Kit: capa, composição resumida e valor calculado item a item.
 * O link fica no título e se estende pelo card (o nome acessível é só o nome do kit).
 */
export default function KitCard({ kit, eager = false }: { kit: KitCardData; eager?: boolean }) {
  const [first, second] = kit.colors;
  const rest = kit.summary.length - VISIBLE_ITEMS;
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card ring-1 ring-line transition-shadow duration-300 hover:shadow-panel">
      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: `linear-gradient(150deg, ${first}55 0%, ${second ?? first}55 100%)` }}>
        <Image
          src={imageUrl(kit.image)}
          alt=""
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 640px) 90vw, (max-width: 1280px) 45vw, 400px"
          className="object-contain p-6 transition-transform duration-500 ease-card group-hover:scale-[1.04] motion-reduce:transition-none"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone="dark">{kit.summary.length} itens</Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-bold leading-tight">
          <Link href={`/monte-seu-kit/${kit.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {kit.name}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-ink/80">{kit.tagline}</p>
        <p className="mt-1 text-caption text-muted">{kit.audience}</p>
        <ul className="mt-4 grid gap-1 text-caption text-ink/80" aria-label={`Itens do ${kit.name}`}>
          {kit.summary.slice(0, VISIBLE_ITEMS).map((line, index) => (
            <li key={`${index}-${line}`} className="flex gap-2">
              <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-coral-700" />
              {line}
            </li>
          ))}
          {rest > 0 && (
            <li className="pl-3.5 font-semibold">
              + {rest} {rest === 1 ? "item" : "itens"}
            </li>
          )}
        </ul>
        {kit.leadDays && (
          <p className="mt-3 flex items-center gap-1.5 text-caption font-medium text-ink/80">
            <IconClock className="size-4 text-coral-700" /> Produção em até {kit.leadDays} {kit.leadDays === 1 ? "dia útil" : "dias úteis"}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
          {/* Composição sugerida: quantidades, medidas e opções ainda podem mudar na página do kit. */}
          <Price value={kit.total} from />
          <span aria-hidden className="flex items-center gap-1.5 text-sm font-bold underline-offset-4 group-hover:underline">
            Ver o kit <IconArrow className="size-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
