import { apiFailure, fail, json, limits, overLimit, readJsonBody, sessionOr401 } from "@/lib/api/guard";
import { atualizaCliente, type AtualizaCliente } from "@/lib/api/padrao";
import { brDate, isValidBirthDate, isValidEmail, isValidPhone, onlyDigits } from "@/lib/api/validation";

/** POST /api/conta/dados {telefone1?, telefone2?, email?, nascimento?} → POST /atualizacliente (codigo = cliente logado). */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.account, `dados:${auth.session.id}`);
  if (blocked) return blocked;

  const raw = (body.data ?? {}) as Record<string, unknown>;
  const text = (field: string) => (typeof raw[field] === "string" ? (raw[field] as string).trim() : "");
  const update: AtualizaCliente = { codigo: auth.session.id };

  const phone1 = text("telefone1");
  const phone2 = text("telefone2");
  const email = text("email");
  const birth = text("nascimento");
  if (phone1) {
    if (!isValidPhone(phone1)) return fail(400, "Telefone principal inválido: use DDD + número.");
    update.telefone1 = onlyDigits(phone1);
  }
  if (phone2) {
    if (!isValidPhone(phone2)) return fail(400, "Segundo telefone inválido: use DDD + número.");
    update.telefone2 = onlyDigits(phone2);
  }
  if (email) {
    if (!isValidEmail(email)) return fail(400, "E-mail inválido.");
    update.email = email.slice(0, 120);
  }
  if (birth) {
    if (!isValidBirthDate(birth)) return fail(400, "Data de nascimento inválida.");
    // A API recusou datas ISO nos filtros de pedido; mandamos no formato que ela aceita (DD/MM/AAAA).
    update.nascimento = brDate(birth);
  }
  if (Object.keys(update).length === 1) return fail(400, "Preencha o que você quer atualizar.");

  try {
    await atualizaCliente(update, auth.session.token);
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível atualizar seus dados agora." });
  }
  return json({ ok: true, message: "Dados atualizados." });
}
