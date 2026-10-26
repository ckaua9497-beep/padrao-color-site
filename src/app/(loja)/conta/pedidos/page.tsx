import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav, LogoutButton } from "@/components/account/AuthPanels";
import { OrderCard } from "@/components/account/OrdersList";
import { PedidosNaFila } from "@/components/account/PedidosNaFila";
import { RecentPrintFiles } from "@/components/product/gabarito/RecentPrintFiles";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button, buttonClass } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import { getPedidos } from "@/lib/api/padrao";
import type { ApiPedidos } from "@/lib/api/types";
import { isValidIsoDate } from "@/lib/api/validation";
import { artesDoCliente } from "@/lib/artes-enviadas/repo";
import { MINUTOS_PARA_CANCELAR, janelaDeCancelamento } from "@/lib/cancelamento";
import { brasiliaClock, feriadosNacionais } from "@/lib/dias-uteis";
import { feriados } from "@/lib/feriados";
import { daCliente } from "@/lib/fila-pedidos/repo";
import { STORE } from "@/lib/store";
import { loginUrl, requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false, follow: false } };

const PAGE_SIZE = 10;

type Search = Record<string, string | string[] | undefined>;

const INPUT = "h-11 w-full rounded-control border border-line-strong bg-white px-3.5 text-[15px] transition-colors placeholder:text-muted focus:border-ink";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession("/conta/pedidos");
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");

  // Filtros: número do pedido, período (input date AAAA-MM-DD → a API recebe DD/MM/AAAA) e página.
  const number = /^\d{1,12}$/.test(one("pedido")) ? one("pedido") : "";
  let from = isValidIsoDate(one("de")) ? one("de") : "";
  let to = isValidIsoDate(one("ate")) ? one("ate") : "";
  if (from && to && from > to) [from, to] = [to, from];
  const page = Math.min(999, Math.max(1, Number.parseInt(one("pag"), 10) || 1));
  const filtered = Boolean(number || from || to);

  let result: ApiPedidos | null = null;
  let failure: string | null = null;
  let expired = false;
  try {
    result = await getPedidos({ pedido: number ? Number(number) : undefined, dataInicial: from || undefined, dataFinal: to || undefined, pag: page, reg: PAGE_SIZE }, session.token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) expired = true;
    else failure = error instanceof ApiError && error.status === 406 ? error.message : "Não foi possível carregar seus pedidos agora. Tente de novo em instantes.";
  }
  if (expired) redirect(loginUrl("/conta/pedidos", true));
  // Pedidos guardados na fila do site (a API não recebeu na hora). Sem o banco, a lista some.
  const naFila = filtered ? [] : await daCliente(session.id).catch(() => []);
  // "Artes enviadas": o que o site guardou de cada pedido. Sem o banco, cada item mostra só o que a API tem.
  const artes = await artesDoCliente(session.id).catch(() => null);

  const orders = result?.pedidos ?? [];
  const pages = Math.max(1, result?.paginas ?? 1);
  // Reenvio de arte: a previsão que valeria se a arte chegasse agora (só busca os feriados quando há arte a reenviar).
  const clock = brasiliaClock();
  const resend = orders.some((order) => (order.itens ?? []).some((item) => item.situacao?.reenvia_arte === "Sim"));
  const resendClock = { clock, holidays: resend ? await feriados() : feriadosNacionais(Number(clock.iso.slice(0, 4))) };
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (number) query.set("pedido", number);
    if (from) query.set("de", from);
    if (to) query.set("ate", to);
    if (target > 1) query.set("pag", String(target));
    const text = query.toString();
    return `/conta/pedidos${text ? `?${text}` : ""}`;
  };

  return (
    <div className="bg-page-cart">
      <div className="container-site py-10 md:py-14">
        <Breadcrumb items={[{ href: "/", label: "Início" }, { href: "/conta", label: "Minha conta" }, { label: "Meus pedidos" }]} />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-section font-bold">Meus pedidos</h1>
            <p className="mt-2 text-muted">{result ? `${result.total} ${result.total === 1 ? "compra" : "compras"}${filtered ? " no filtro" : ""}` : "Acompanhe produção, entrega, arte e nota fiscal."}</p>
          </div>
          <LogoutButton />
        </div>
        <div className="mt-6">
          <AccountNav current="pedidos" />
        </div>
        <PedidosNaFila entradas={naFila} />

        <form method="get" action="/conta/pedidos" className="mt-6 grid gap-3 rounded-card border border-line-strong bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="text-caption font-semibold">
            Número do pedido
            <input name="pedido" inputMode="numeric" pattern="[0-9]*" defaultValue={number} placeholder="Ex.: 12345" className={`mt-1 ${INPUT}`} />
          </label>
          <label className="text-caption font-semibold">
            De
            <input type="date" name="de" defaultValue={from} className={`mt-1 ${INPUT}`} />
          </label>
          <label className="text-caption font-semibold">
            Até
            <input type="date" name="ate" defaultValue={to} className={`mt-1 ${INPUT}`} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonClass({ variant: "dark", size: "sm" })}>
              Filtrar
            </button>
            {filtered && (
              <Link href="/conta/pedidos" className={buttonClass({ variant: "outline", size: "sm" })}>
                Limpar
              </Link>
            )}
          </div>
        </form>

        <RecentPrintFiles className="mt-6" />

        <div className="mt-6 space-y-5">
          {failure ? (
            <div role="alert" className="rounded-card border border-line-strong bg-white p-8 text-center">
              <p className="text-lg font-semibold">{failure}</p>
              <Button href={pageHref(page)} variant="dark" size="sm" className="mt-5">
                Tentar de novo
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-card border border-line-strong bg-white p-10 text-center">
              <p className="text-lg font-semibold">{filtered ? "Nenhum pedido encontrado com esse filtro." : "Você ainda não tem pedidos."}</p>
              <Button href={filtered ? "/conta/pedidos" : "/produtos"} variant="buy" size="md" className="mt-6">
                {filtered ? "Ver todos os pedidos" : "Ver produtos"}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-caption text-muted">
                Você pode cancelar uma compra, ou só um item dela, até {MINUTOS_PARA_CANCELAR} minutos depois de finalizar. Depois disso, fale com o{" "}
                <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
                  atendimento
                </a>
                .
              </p>
              {orders.map((order) => (
                <OrderCard
                  key={order.compra}
                  order={order}
                  janela={janelaDeCancelamento(order)}
                  resendClock={resendClock}
                  artes={{ itens: artes?.compras.get(String(order.compra)) ?? [], reenvios: artes?.reenvios ?? new Map() }}
                />
              ))}
            </>
          )}
        </div>

        {pages > 1 && !failure && (
          <nav aria-label="Páginas de pedidos" className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={buttonClass({ variant: "outline", size: "sm" })}>
                Anterior
              </Link>
            ) : null}
            <span className="text-sm text-muted">
              Página {page} de {pages}
            </span>
            {page < pages ? (
              <Link href={pageHref(page + 1)} className={buttonClass({ variant: "outline", size: "sm" })}>
                Próxima
              </Link>
            ) : null}
          </nav>
        )}
      </div>
    </div>
  );
}
