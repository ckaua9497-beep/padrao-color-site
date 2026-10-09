import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import fonte from "@/data/novos/fonte.json";
import { novosCategorias, novosGrupos, novosIndice, novosProdutos, novosRecurso, type NovosFonte, type NovosQuery } from "@/lib/novos-api";

/*
 * API própria dos produtos novos (que a Padrão Color ainda não tem na API dela), no mesmo formato da API da
 * Padrão: GET /api/novos (índice com todos os produtos e parâmetros), /api/novos/categorias, /grupos e
 * /produtos, com os mesmos filtros. Sem registros: 204, como a Padrão. Pública e só de leitura; com
 * NOVOS_API_TOKEN definido, exige "Authorization: Bearer <token>". Consumida por scripts/sync-novos.mjs.
 */

const data = fonte as unknown as NovosFonte;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Accept",
  "Cache-Control": "public, max-age=300",
};

function authorized(request: NextRequest): boolean {
  const expected = process.env.NOVOS_API_TOKEN?.trim();
  if (!expected) return true;
  const sent = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ recurso?: string[] }> }) {
  if (!authorized(request)) {
    return Response.json({ ERRO: "Token inválido ou ausente." }, { status: 401, headers: { ...HEADERS, "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } });
  }
  const recurso = novosRecurso((await params).recurso);
  if (recurso === undefined) return Response.json({ ERRO: "Recurso inexistente. Use /api/novos, /categorias, /grupos ou /produtos." }, { status: 404, headers: HEADERS });

  const query: NovosQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
  if (recurso === null) {
    const base = `${request.nextUrl.origin}/api/novos`;
    return Response.json(novosIndice(data, base), { headers: HEADERS });
  }
  const rows = recurso === "categorias" ? novosCategorias(data, query) : recurso === "grupos" ? novosGrupos(data, query) : novosProdutos(data, query);
  // Sem registros: 204 sem corpo, como a API da Padrão.
  if (!rows.length) return new Response(null, { status: 204, headers: HEADERS });
  return Response.json(rows, { headers: HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
