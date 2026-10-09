import { ApiError, apiUnavailable } from "@/lib/api/client";
import { apiFailure, clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";

const UNAVAILABLE = "Não foi possível entrar agora. Tente de novo em instantes.";
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

  // API sem conexão: responde já, sem contar tentativa (nada chega a ela e a senha pode estar certa).
  if (apiUnavailable()) return fail(503, UNAVAILABLE);

  const user = normalizeLogin(usuario);
  const userKey = `login:${user.toLowerCase()}`;
  const ip = clientIp(request);
  const blocked = overLimit(limits.loginIp, ip) ?? overLimit(limits.loginUser, userKey);
  if (blocked) return blocked;

  let token: string;
  try {
    token = (await login(user, senha)).api_token;
  } catch (error) {
    if (!(error instanceof ApiError)) return apiFailure(error, { fallback: UNAVAILABLE });
    // 401/406 (e afins) e resposta sem token = credencial errada; não diz qual dos dois.
    if ([400, 401, 404, 406, 422].includes(error.status)) return fail(401, "Usuário ou senha inválidos.");
    if (error.reached === false) {
      // Não chegou à API (sem conexão): a tentativa não conta.
      limits.loginUser.undo(userKey);
      if (ip) limits.loginIp.undo(ip);
      return fail(503, UNAVAILABLE);
    }
    // 429/403 (limite ou bloqueio da API), redirecionamento e falha do sistema: a senha pode estar certa.
    if (error.status === 429) return fail(503, "O sistema da Padrão Color recebeu tentativas demais. Tente de novo em alguns minutos.");
    if (error.status < 500) console.error(`[conta] login recusado pela API com status ${error.status}`);
    return fail(502, UNAVAILABLE);
  }

  let cliente: ApiCliente | null;
  try {
    cliente = await getCliente(token);
  } catch (error) {
    console.error(`[conta] login aceito, mas GET /cliente falhou: ${error instanceof ApiError ? error.status : "erro desconhecido"}`);
    cliente = null;
  }
  if (!cliente?.id) return fail(502, "Entramos, mas não foi possível carregar os dados da sua conta. Tente de novo.");

  limits.loginUser.reset(userKey);
  const session = newSession(token, cliente);
  await saveSession(session);
  return json({ ok: true, customer: publicCustomer(session, cliente.conta_corrente?.saldo) });
}
