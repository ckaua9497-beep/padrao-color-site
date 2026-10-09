import { NextResponse, type NextRequest } from "next/server";
import { parseTenantHost } from "./lib/multiloja/core";

/*
 * Multiloja: cada loja responde no próprio host (<loja>.<MULTILOJA_DOMINIO> ou domínio próprio). Aqui o
 * caminho é reescrito para /vitrine/<host>/…, sem mudar a URL que o cliente vê. O site principal segue igual,
 * e /vitrine direto pelo site principal não existe.
 * Ficam de fora: /api, /painel (painel do lojista, igual em qualquer host), /_next e arquivos com extensão.
 */

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const root = process.env.MULTILOJA_DOMINIO?.trim().toLowerCase() || "localhost";
  const main = (process.env.MULTILOJA_HOSTS_PRINCIPAIS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const tenant = parseTenantHost(host, root, main);
  const { pathname } = request.nextUrl;

  if (tenant.kind === "main") {
    if (pathname === "/vitrine" || pathname.startsWith("/vitrine/")) return new NextResponse("Página não encontrada", { status: 404 });
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/vitrine/${encodeURIComponent(host.toLowerCase().replace(/:\d+$/, ""))}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api/|painel|_next/|.*\\.[a-z0-9]{2,5}$).*)"],
};
