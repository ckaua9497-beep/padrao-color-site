import { json, readJsonBody } from "@/lib/api/guard";
import { clearSession } from "@/lib/session";

/** POST /api/conta/logout: apaga o cookie de sessão. */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 1024);
  if (!body.ok) return body.response;
  await clearSession();
  return json({ ok: true, customer: { status: "anonymous" } });
}
