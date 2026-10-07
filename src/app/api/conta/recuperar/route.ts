import { apiFailure, clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { alterarSenhaAtual, recuperarEmail, recuperarSenha } from "@/lib/api/padrao";
import { cleanDocument, isValidDocument, isValidEmail, maskEmail, maskEmailsIn, passwordMessage } from "@/lib/api/validation";

/*
 * POST /api/conta/recuperar — recuperação de acesso em etapas ({acao}):
 * - "email":  documento → POST /recuperaremail; devolve só o e-mail MASCARADO (CPF não revela e-mail completo);
 * - "codigo": documento + e-mail → POST /recuperarsenha (a Padrão envia o código por e-mail);
 * - "senha":  documento + e-mail + código + nova senha → POST /recuperarsenha;
 * - "token":  e-mail + token do link + nova senha → POST /alterarsenhaatual.
 * As respostas da API não são documentadas: mensagens passam pela máscara de e-mail.
 */

type Body = { acao?: unknown; documento?: unknown; email?: unknown; codigo?: unknown; senha?: unknown; token?: unknown };

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const EMAIL_IN_TEXT = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[A-Za-z]{2,}/;

function collectStrings(value: unknown, depth = 0, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (depth <= 2 && typeof value === "object" && value !== null) for (const item of Object.values(value)) collectStrings(item, depth + 1, out);
  return out;
}

/** Primeiro e-mail e primeira mensagem de texto na resposta (formato não documentado). */
function readReply(reply: unknown): { email: string | null; message: string | null } {
  const strings = collectStrings(reply);
  const email = strings.map((text) => EMAIL_IN_TEXT.exec(text)?.[0]).find((found) => found !== undefined) ?? null;
  const message = strings.find((text) => !EMAIL_IN_TEXT.test(text) && text.trim().length > 3 && text.length < 300)?.trim() ?? null;
  return { email: email ? maskEmail(email) : null, message: message ? maskEmailsIn(message) : null };
}

export async function POST(request: Request) {
  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const data = (body.data ?? {}) as Body;
  const action = data.acao;
  const blocked = overLimit(limits.recover, clientIp(request));
  if (blocked) return blocked;

  const documento = cleanDocument(str(data.documento, 30));
  const email = str(data.email, 120);
  const senha = typeof data.senha === "string" ? data.senha.slice(0, 100) : "";

  try {
    if (action === "email") {
      if (!isValidDocument(documento)) return fail(400, "Informe um CPF ou CNPJ válido.");
      const reply = readReply(await recuperarEmail(documento));
      return json({ ok: true, email: reply.email, message: reply.message });
    }

    if (action === "codigo") {
      if (!isValidDocument(documento)) return fail(400, "Informe um CPF ou CNPJ válido.");
      if (!isValidEmail(email)) return fail(400, "Informe o e-mail do cadastro.");
      // Cada pedido manda um e-mail: limite também por documento.
      const tooMany = overLimit(limits.recoverCode, `codigo:${documento}`);
      if (tooMany) return tooMany;
      const reply = readReply(await recuperarSenha({ documento, email }));
      return json({ ok: true, message: reply.message ?? "Se os dados conferirem, você vai receber um código no e-mail do cadastro." });
    }

    if (action === "senha") {
      const codigo = str(data.codigo, 20);
      if (!isValidDocument(documento) || !isValidEmail(email)) return fail(400, "Comece de novo: informe o documento e o e-mail.");
      if (!/^[0-9A-Za-z-]{3,20}$/.test(codigo)) return fail(400, "Informe o código que chegou no seu e-mail.");
      const problem = passwordMessage(senha);
      if (problem) return fail(400, problem);
      const tooMany = overLimit(limits.recoverCode, `senha:${documento}`);
      if (tooMany) return tooMany;
      await recuperarSenha({ documento, email, codigo, senha });
      return json({ ok: true, message: "Senha alterada. Entre com a nova senha." });
    }

    if (action === "token") {
      const token = str(data.token, 600);
      if (!isValidEmail(email) || token.length < 8) return fail(400, "Link de recuperação inválido ou incompleto. Peça um novo.");
      const problem = passwordMessage(senha);
      if (problem) return fail(400, problem);
      const tooMany = overLimit(limits.recoverCode, `token:${email.toLowerCase()}`);
      if (tooMany) return tooMany;
      await alterarSenhaAtual({ email, token, senha });
      return json({ ok: true, message: "Senha alterada. Entre com a nova senha." });
    }
  } catch (error) {
    return apiFailure(error, { fallback: "Não foi possível concluir a recuperação agora. Tente de novo em instantes." });
  }

  return fail(400, "Etapa de recuperação inválida.");
}
