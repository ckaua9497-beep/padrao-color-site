/*
 * Rastreador do navegador (site da Padrão e multilojas): visitas, produtos vistos, carrinho e checkout, para o
 * painel de análise da Padrão (funil, abandono de carrinho, produtos vencedores). Anônimo: o visitante é um número
 * aleatório guardado no navegador e a sessão acaba após 30 min parada. Quem liga o "Global Privacy Control" ou o
 * "Do Not Track" não é rastreado.
 * Uso: track("carrinho_add", { p: "248-cartao-de-visita", q: 1, val: 39.42 }).
 */

type ClientEvent = "visita" | "produto_view" | "carrinho_add" | "carrinho_remove" | "checkout_inicio";
type Payload = { p?: string; q?: number; val?: number; ref?: string };

const VISITOR_KEY = "pc_v";
const SESSION_KEY = "pc_s";
const SESSION_IDLE_MS = 30 * 60_000;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

/** Visitante e sessão atuais (null fora do navegador ou com opt-out). */
export function trackingIds(): { v: string; s: string } | null {
  if (typeof window === "undefined" || optedOut()) return null;
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v || !/^[a-z0-9]{16,40}$/.test(v)) {
      v = randomId();
      localStorage.setItem(VISITOR_KEY, v);
    }
    const now = Date.now();
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as { id?: string; last?: number } | null;
    const s = stored?.id && stored.last && now - stored.last < SESSION_IDLE_MS ? stored.id : randomId();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: s, last: now }));
    return { v, s };
  } catch {
    return null;
  }
}

/** Cabeçalhos para o servidor ligar o pedido à sessão (funil e abandono). */
export function trackingHeaders(): Record<string, string> {
  const ids = trackingIds();
  return ids ? { "x-pc-visitante": ids.v, "x-pc-sessao": ids.s } : {};
}

let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  const ids = trackingIds();
  if (!ids || !queue.length) {
    queue = [];
    return;
  }
  const body = JSON.stringify({ ...ids, e: queue.splice(0, 30) });
  try {
    const sent = navigator.sendBeacon?.("/api/eventos", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/eventos", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // rastreamento nunca atrapalha a navegação
  }
  if (queue.length) flush();
}

// O mesmo evento repetido em poucos segundos (efeito que roda duas vezes, componente remontado) conta uma vez só.
const DEDUPE_MS = 3000;
const recent = new Map<string, number>();

export function track(type: ClientEvent, payload: Payload = {}) {
  if (typeof window === "undefined" || optedOut()) return;
  const path = window.location.pathname;
  if (type !== "carrinho_add" && type !== "carrinho_remove") {
    const key = `${type}|${path}|${payload.p ?? ""}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < DEDUPE_MS) return;
    recent.set(key, now);
  }
  queue.push({ t: type, path, ...payload });
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
  if (!timer) timer = setTimeout(flush, 1500);
}
