/*
 * Rastreamento de navegação e vendas (puro, testado em eventos.test.ts). Vale para o site da Padrão (loja 0) e
 * para todas as multilojas. Sem dados pessoais: o visitante é um identificador aleatório do navegador, a sessão
 * acaba após 30 min parada, e nada de nome, e-mail, IP ou endereço vai para os eventos.
 *
 * Eventos que o navegador pode mandar: visita, produto_view, carrinho_add, carrinho_remove, checkout_inicio.
 * Eventos que só o servidor grava (a partir do pedido de verdade): pedido_criado, pedido_item, pedido_pago.
 */

export const CLIENT_EVENTS = ["visita", "produto_view", "carrinho_add", "carrinho_remove", "checkout_inicio"] as const;
export const SERVER_EVENTS = ["pedido_criado", "pedido_item", "pedido_pago"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type EventType = ClientEvent | (typeof SERVER_EVENTS)[number];

export type TrackedEvent = {
  tipo: EventType;
  /** Produto (id do catálogo ou slug; o servidor normaliza para o id). */
  produto: string | null;
  quantidade: number | null;
  valor: number | null;
  caminho: string | null;
  ref: string | null;
};

export const MAX_BATCH = 30;
const ID_RE = /^[a-z0-9]{16,40}$/;

export const isTrackingId = (value: unknown): value is string => typeof value === "string" && ID_RE.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function finite(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
}

/** Lote que o navegador manda: {v: visitante, s: sessão, e: [{t, p?, q?, val?, path?, ref?}]}. Descarta o que não confere. */
export function parseEventBatch(raw: unknown): { visitante: string; sessao: string; eventos: TrackedEvent[] } | null {
  if (!isRecord(raw) || !isTrackingId(raw.v) || !isTrackingId(raw.s) || !Array.isArray(raw.e)) return null;
  const eventos = raw.e.slice(0, MAX_BATCH).flatMap((item): TrackedEvent[] => {
    if (!isRecord(item) || !(CLIENT_EVENTS as readonly string[]).includes(String(item.t))) return [];
    const produto = typeof item.p === "string" && /^[a-z0-9-]{1,120}$/i.test(item.p) ? item.p : null;
    const caminho = typeof item.path === "string" && item.path.startsWith("/") ? item.path.slice(0, 200).replace(/[?#].*$/, "") : null;
    const ref = typeof item.ref === "string" && /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/.test(item.ref) ? item.ref : null;
    return [{ tipo: item.t as ClientEvent, produto, quantidade: finite(item.q, 1_000_000), valor: finite(item.val, 1_000_000), caminho, ref }];
  });
  return { visitante: raw.v, sessao: raw.s, eventos };
}

/** Tipo de aparelho pelo User-Agent (só a categoria). */
export function deviceFrom(userAgent: string | null): "celular" | "tablet" | "computador" {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "celular";
  return "computador";
}

/** Robôs não contam como visita. */
export function isBot(userAgent: string | null): boolean {
  return /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp/i.test(userAgent ?? "");
}

// ---------------------------------------------------------------------------------- análise (funil e abandono)

export type Funnel = { sessoes: number; produto: number; carrinho: number; checkout: number; pedido: number; pago: number };

export type FunnelRates = { verProduto: number; carrinho: number; checkout: number; pedido: number; pago: number; abandonoCarrinho: number; abandonoCheckout: number; conversao: number; conversaoPedido: number };

// Até 100%: um pedido sem rastreamento (navegador com "não rastrear") pode não ter passado pelas etapas anteriores.
const ratio = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 1000) / 10) : 0);

/**
 * Taxas do funil em %: cada etapa sobre a anterior. Abandono de carrinho = sessões com produto no carrinho que
 * não fizeram pedido; abandono de checkout = sessões que abriram o checkout e não fizeram pedido.
 */
export function funnelRates(f: Funnel): FunnelRates {
  return {
    verProduto: ratio(f.produto, f.sessoes),
    carrinho: ratio(f.carrinho, f.produto),
    checkout: ratio(f.checkout, f.carrinho),
    pedido: ratio(f.pedido, f.checkout),
    pago: ratio(f.pago, f.pedido),
    abandonoCarrinho: f.carrinho > 0 ? Math.round((1 - Math.min(f.pedido, f.carrinho) / f.carrinho) * 1000) / 10 : 0,
    abandonoCheckout: f.checkout > 0 ? Math.round((1 - Math.min(f.pedido, f.checkout) / f.checkout) * 1000) / 10 : 0,
    conversao: ratio(f.pago, f.sessoes),
    conversaoPedido: ratio(f.pedido, f.sessoes),
  };
}

/** Itens que sobraram num carrinho abandonado: adições menos remoções, por produto. */
export function cartContents(events: { tipo: string; produto: string | null; quantidade: number | null; valor: number | null }[]): { produto: string; quantidade: number; valor: number }[] {
  const items = new Map<string, { produto: string; quantidade: number; valor: number }>();
  for (const e of events) {
    if (!e.produto) continue;
    const item = items.get(e.produto) ?? { produto: e.produto, quantidade: 0, valor: 0 };
    const sign = e.tipo === "carrinho_add" ? 1 : e.tipo === "carrinho_remove" ? -1 : 0;
    item.quantidade += sign * (e.quantidade ?? 1);
    item.valor += sign * (e.valor ?? 0);
    items.set(e.produto, item);
  }
  return [...items.values()].filter((i) => i.quantidade > 0).map((i) => ({ ...i, valor: Math.max(0, Math.round(i.valor * 100) / 100) }));
}
