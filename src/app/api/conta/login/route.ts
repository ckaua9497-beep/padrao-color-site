import { ApiError } from "@/lib/api/client";
import { clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { getCliente, login } from "@/lib/api/padrao";
import type { ApiCliente } from "@/lib/api/types";
import { normalizeLogin } from "@/lib/api/validation";
import { newSession, publicCustomer, saveSession } from "@/lib/session";

/** POST /api/conta/login {usuario, senha} → POST /user/login + GET /cliente → cookie de sessão. */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const { usuario, senha } = (body.data ?? {}) as { usuario?: unknown; senha?: unknown };
  if (typeof usuario !== "string" || typeof senha !== "string" || !usuario.trim() || !senha) return fail(400, "Informe o usuário e a senha.");
  if (usuario.length > 120 || senha.length > 100) return fail(401, "Usuário ou senha inválidos.");

  const user = normalizeLogin(usuario);
  const userKey = `login:${user.toLowerCase()}`;
  const blocked = overLimit(limits.loginIp, clientIp(request)) ?? overLimit(limits.loginUser, userKey);
  if (blocked) return blocked;

  let token: string;
  try {
    token = (await login(user, senha)).api_token;
  } catch (error) {
    // 401/406 e resposta sem token = credencial errada; não diz qual dos dois.
    if (error instanceof ApiError && error.status >= 500) {
      return fail(502, "Não foi possível entrar agora. Tente de novo em instantes.");
    }
    return fail(401, "Usuário ou senha inválidos.");
  }

  let cliente: ApiCliente | null;
  try {
    cliente = await getCliente(token);
  } catch {
    cliente = null;
  }
  if (!cliente?.id) return fail(502, "Entramos, mas não foi possível carregar os dados da sua conta. Tente de novo.");

  limits.loginUser.reset(userKey);
  const session = newSession(token, cliente);
  await saveSession(session);
  return json({ ok: true, customer: publicCustomer(session, cliente.conta_corrente?.saldo) });
}
