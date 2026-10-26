import { apiFailure, clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { cadastrarCliente, getCliente, login, type CadastroCliente } from "@/lib/api/padrao";
import { brDate, cleanDocument, documentKind, EMPTY_SIGNUP, onlyDigits, signupErrors, type SignupInput } from "@/lib/api/validation";
import { saldoDaConta } from "@/lib/cliente";
import { newSession, publicCustomer, saveSession } from "@/lib/session";

/** Corpo do formulário → campos conhecidos, só texto e com tamanho máximo. */
function readSignup(data: unknown): SignupInput {
  const raw = (data ?? {}) as Record<string, unknown>;
  const input = { ...EMPTY_SIGNUP };
  for (const field of Object.keys(EMPTY_SIGNUP) as (keyof SignupInput)[]) {
    const value = raw[field];
    if (typeof value === "string") input[field] = field === "senha" || field === "confirmacao" ? value.slice(0, 100) : value.trim().slice(0, 160);
  }
  return input;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * POST /api/conta/cadastro → POST /cadastrarcliente com o token da integração (quem ainda não tem conta
 * não tem token próprio) e, em seguida, login automático (documento; se não der, e-mail).
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;
  // Campo isca: robô preenche, gente não vê.
  const honeypot = (body.data as { site?: unknown } | null)?.site;
  if (typeof honeypot === "string" && honeypot.trim()) return fail(400, "Cadastro recusado.");

  const input = readSignup(body.data);
  const errors = signupErrors(input, { confirmPassword: false });
  if (Object.keys(errors).length) return fail(400, "Confira os campos destacados.", { fields: errors });

  const kind = documentKind(input.documento);
  const documento = cleanDocument(input.documento);
  const blocked = overLimit(limits.signup, clientIp(request)) ?? overLimit(limits.signup, `doc:${documento}`);
  if (blocked) return blocked;
  const cadastro: CadastroCliente = {
    documento,
    nomecompleto: input.nome,
    nomereduzido: (input.apelido || (kind === "cpf" ? firstName(input.nome) : input.nome)).slice(0, 60),
    emailprincipal: input.email.trim(),
    senha: input.senha,
    telefone1: onlyDigits(input.telefone),
    endereco: {
      logradouro: input.logradouro,
      numero: input.numero,
      complemento: input.complemento,
      bairro: input.bairro,
      cidade: input.cidade,
      estado: input.estado.toUpperCase(),
      cep: onlyDigits(input.cep),
    },
    ...(kind === "cpf" && input.nascimento ? { nascimento: brDate(input.nascimento) } : {}),
    ...(kind === "cnpj" && input.inscricaoEstadual ? { inscricaoestadual: input.inscricaoEstadual } : {}),
    ...(kind === "cnpj" && input.responsavel ? { responsavel: input.responsavel } : {}),
  };

  try {
    await cadastrarCliente(cadastro);
  } catch (error) {
    return apiFailure(error, { fallback: "Não foi possível criar a conta agora. Tente de novo em instantes." });
  }

  // Login automático: o "Usuario" de quem acabou de se cadastrar não é documentado (documento ou e-mail).
  for (const usuario of [documento, cadastro.emailprincipal]) {
    try {
      const { api_token } = await login(usuario, input.senha);
      const cliente = await getCliente(api_token);
      if (!cliente?.id) break;
      const session = newSession(api_token, cliente);
      await saveSession(session);
      return json({ ok: true, loggedIn: true, customer: publicCustomer(session, saldoDaConta(cliente.conta_corrente)) });
    } catch {
      // tenta o próximo identificador
    }
  }
  return json({ ok: true, loggedIn: false, message: "Conta criada! Entre com seu CPF/CNPJ ou e-mail e a senha que você cadastrou." });
}
