import { ApiError } from "@/lib/api/client";
import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";
import { atualizaCliente, getCliente, login } from "@/lib/api/padrao";
import { passwordMessage } from "@/lib/api/validation";

/** A senha atual confere? Tenta o usuário de acesso do cadastro e, sem ele, o documento. */
async function currentPasswordMatches(candidates: string[], password: string): Promise<boolean> {
  for (const usuario of candidates) {
    try {
      await login(usuario, password);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 500) throw error;
    }
  }
  return false;
}

/** POST /api/conta/senha {atual, nova}: confere a senha atual no POST /user/login e troca no POST /atualizacliente. */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.account, `senha:${auth.session.id}`);
  if (blocked) return blocked;

  const { atual, nova } = (body.data ?? {}) as { atual?: unknown; nova?: unknown };
  if (typeof atual !== "string" || !atual || atual.length > 100) return fail(400, "Informe a senha atual.");
  if (typeof nova !== "string") return fail(400, "Informe a nova senha.");
  const problem = passwordMessage(nova);
  if (problem) return fail(400, problem);
  if (nova === atual) return fail(400, "A nova senha precisa ser diferente da atual.");

  try {
    const cliente = await getCliente(auth.session.token);
    const candidates = [cliente?.login, cliente?.documento].map((value) => (value ?? "").trim()).filter(Boolean);
    if (!(await currentPasswordMatches([...new Set(candidates)].slice(0, 2), atual))) return fail(400, "Senha atual incorreta.");
    await atualizaCliente({ codigo: auth.session.id, senha: nova }, auth.session.token);
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível trocar a senha agora." });
  }
  return json({ ok: true, message: "Senha alterada." });
}
