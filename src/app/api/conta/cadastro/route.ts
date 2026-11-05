import { apiFailure, clientIp, fail, json, limits, overLimit, readJsonBody } from "@/lib/api/guard";
import { cadastrarCliente, getCliente, login, type CadastroCliente } from "@/lib/api/padrao";
import { brDate, cleanDocument, EMPTY_SIGNUP, onlyDigits, signupErrors, type SignupInput } from "@/lib/api/validation";
import { saldoDaConta } from "@/lib/cliente";
import { consultarCnpj } from "@/lib/cnpj-receita";
import { camposDoPerfil, decisaoDaRevenda, lerRespostas, questionarioErros, textoDaRevenda, type DecisaoRevenda } from "@/lib/revenda";
import { newSession, publicCustomer, saveSession } from "@/lib/session";

/** Corpo do formulário → campos conhecidos, só texto e com tamanho máximo. */
function readSignup(data: unknown): SignupInput {
  const raw = (data ?? {}) as Record<string, unknown>;
  const input = { ...EMPTY_SIGNUP };
  for (const field of Object.keys(EMPTY_SIGNUP) as (keyof SignupInput)[]) {
    const value = raw[field];
    if (typeof value === "string") input[field] = field === "senha" ? value.slice(0, 100) : value.trim().slice(0, 160);
  }
  return input;
}

const opcional = (value: string) => value.trim() || undefined;

/**
 * POST /api/conta/cadastro → POST /cadastrarcliente com o token da integração (quem ainda não tem conta
 * não tem token próprio) e, em seguida, login automático (documento; se não der, e-mail).
 * Revendedor (revenda.ts): o CNPJ é consultado na Receita e aprovado na hora com um CNAE da lista; CPF, ou CNPJ sem CNAE
 * da lista, vai para a avaliação da Padrão. O perfil, a situação e o questionário vão junto do cadastro.
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request, 16 * 1024);
  if (!body.ok) return body.response;
  // Campo isca: robô preenche, gente não vê.
  const honeypot = (body.data as { site?: unknown } | null)?.site;
  if (typeof honeypot === "string" && honeypot.trim()) return fail(400, "Cadastro recusado.");

  const input = readSignup(body.data);
  const revendedor = input.perfil === "revendedor";
  const respostas = revendedor ? lerRespostas((body.data as { questionario?: unknown } | null)?.questionario) : {};
  const errors = signupErrors(input);
  const pendentes = revendedor ? questionarioErros(respostas) : {};
  if (Object.keys(errors).length || Object.keys(pendentes).length) return fail(400, "Confira os campos destacados.", { fields: errors, questionario: pendentes });

  const pj = input.pessoa === "pj";
  const documento = cleanDocument(input.documento);
  const blocked = overLimit(limits.signup, clientIp(request)) ?? overLimit(limits.signup, `doc:${documento}`);
  if (blocked) return blocked;

  let decisao: DecisaoRevenda | null = null;
  if (revendedor) decisao = decisaoDaRevenda(pj ? "pj" : "pf", pj ? await consultarCnpj(documento) : null);

  const cadastro: CadastroCliente = {
    documento,
    nomecompleto: input.nome,
    nomereduzido: input.apelido.slice(0, 60),
    emailprincipal: input.email.trim(),
    emailsecundario: opcional(input.emailSecundario),
    senha: input.senha,
    telefone1: onlyDigits(input.telefone),
    telefone2: opcional(onlyDigits(input.telefone2)),
    nascimento: brDate(input.nascimento),
    endereco: {
      logradouro: input.logradouro,
      numero: input.numero,
      complemento: input.complemento,
      bairro: input.bairro,
      cidade: input.cidade,
      estado: input.estado.toUpperCase(),
      cep: onlyDigits(input.cep),
      referencia: opcional(input.referencia),
    },
    ...(pj
      ? {
          inscricaoestadual: opcional(input.inscricaoEstadual),
          inscricaomunicipal: opcional(input.inscricaoMunicipal),
          ramoatividade: opcional(input.ramo),
          responsavel: opcional(input.responsavel),
          cpfResponsavel: onlyDigits(input.cpfResponsavel),
        }
      : {}),
    ...camposDoPerfil(revendedor ? "revendedor" : "cliente", decisao, respostas),
  };

  try {
    await cadastrarCliente(cadastro);
  } catch (error) {
    return apiFailure(error, { fallback: "Não foi possível criar a conta agora. Tente de novo em instantes." });
  }

  const revenda = decisao ? { situacao: decisao.situacao, texto: textoDaRevenda(decisao) } : undefined;
  // Login automático: o "Usuario" de quem acabou de se cadastrar não é documentado (documento ou e-mail).
  for (const usuario of [documento, cadastro.emailprincipal]) {
    try {
      const { api_token } = await login(usuario, input.senha);
      const cliente = await getCliente(api_token);
      if (!cliente?.id) break;
      const session = newSession(api_token, cliente);
      await saveSession(session);
      return json({ ok: true, loggedIn: true, customer: publicCustomer(session, saldoDaConta(cliente.conta_corrente)), revenda });
    } catch {
      // tenta o próximo identificador
    }
  }
  return json({ ok: true, loggedIn: false, message: "Conta criada! Entre com seu CPF/CNPJ ou e-mail e a senha que você cadastrou.", revenda });
}
