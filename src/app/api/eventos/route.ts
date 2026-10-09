import { isSameOrigin } from "@/lib/api/guard";
import { insertEvents } from "@/lib/multiloja/analytics";
import { deviceFrom, isBot, parseEventBatch } from "@/lib/multiloja/eventos";
import { limited, lojaDaRequisicao, vitrineLimits } from "@/lib/multiloja/http";
import { mainHosts, rootDomain } from "@/lib/multiloja/tenant";
import { parseTenantHost } from "@/lib/multiloja/core";

/**
 * POST /api/eventos — lote de eventos de navegação do site da Padrão (loja 0) ou de uma multiloja (pelo Host).
 * Anônimo (sem IP, sem dados pessoais), limitado por IP, e robôs não contam. Sempre 204.
 */
export async function POST(request: Request) {
  const done = new Response(null, { status: 204 });
  if (!isSameOrigin(request) || isBot(request.headers.get("user-agent"))) return done;
  if (limited(vitrineLimits.visita, request, "eventos")) return done;

  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
  const tenant = parseTenantHost(host, rootDomain(), mainHosts());
  const lojaId = tenant.kind === "main" ? 0 : (lojaDaRequisicao(request)?.id ?? null);
  if (lojaId === null) return done;

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 32 * 1024) return done;
    raw = JSON.parse(text);
  } catch {
    return done;
  }
  const batch = parseEventBatch(raw);
  if (!batch?.eventos.length) return done;
  try {
    insertEvents(lojaId, batch.visitante, batch.sessao, deviceFrom(request.headers.get("user-agent")), batch.eventos);
  } catch (error) {
    console.error("[rastreamento]", error instanceof Error ? error.message : error);
  }
  return done;
}
