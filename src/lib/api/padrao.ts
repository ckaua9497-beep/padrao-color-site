import "server-only";

import { ApiError, apiDate, apiRequest } from "./client";
import type {
  ApiAcabamento,
  ApiCategoria,
  ApiCliente,
  ApiConfiguracao,
  ApiContaCorrente,
  ApiEndereco,
  ApiFeriado,
  ApiGrupo,
  ApiPedidos,
  ApiProduto,
  ApiRevenda,
  ApiTipoNegocio,
} from "./types";

/*
 * Um wrapper por endpoint do PDF "Documentação de Integração — API" (alteraçoes/DocumentacaoPadraoColor.pdf).
 * `token` = token do cliente logado; sem ele vale o token da integração (PADRAO_API_TOKEN).
 * Os endpoints de escrita (pedido, cadastro, cancelamento, reenvio de arte) mexem no sistema real.
 */

// ---------------------------------------------------------------------------------- autenticação

export async function login(usuario: string, senha: string): Promise<{ api_token: string }> {
  const result = await apiRequest<{ api_token: string }>("/user/login", { method: "POST", token: false, body: { Usuario: usuario, Senha: senha } });
  if (!result?.api_token) throw new ApiError(401, "Login sem token na resposta.");
  return result;
}

/** Recupera informações do e-mail cadastrado a partir do documento (CPF/CNPJ). */
export function recuperarEmail(documento: string) {
  return apiRequest<Record<string, unknown>>("/recuperaremail", { method: "POST", token: false, body: { documento } });
}

/** Fluxo de recuperação: primeiro só documento + e-mail (envia o código); depois com senha + código. */
export function recuperarSenha(body: { documento: string; email: string; senha?: string; codigo?: string }) {
  return apiRequest<Record<string, unknown>>("/recuperarsenha", { method: "POST", token: false, body });
}

export function alterarSenhaAtual(body: { email: string; senha?: string; token?: string }) {
  return apiRequest<Record<string, unknown>>("/alterarsenhaatual", { method: "POST", token: false, body });
}

// ---------------------------------------------------------------------------------- catálogo

export const getConfiguracoes = () => apiRequest<ApiConfiguracao[]>("/configuracoes");
export const getTiposNegocio = (query?: { id?: number; nome?: string }) => apiRequest<ApiTipoNegocio[]>("/tiposnegocio", { query });
export const getCategorias = (query?: { id?: number; categoria?: string; grupo?: string }) => apiRequest<ApiCategoria[]>("/categorias", { query });
export const getGrupos = (query?: { id?: number; categoria?: string; grupo?: string; tag?: string }, token?: string) =>
  apiRequest<ApiGrupo[]>("/grupos", { query, token, timeoutMs: 60_000 });

/** Sempre com filtro: sem filtro o gateway devolve 504. `token` do cliente traz a tabela de preço dele. */
export const getProdutos = (query: { id_produto?: number; id_grupo?: number; id_categoria?: number; categoria?: string; grupo?: string }, token?: string) =>
  apiRequest<ApiProduto[]>("/produtos", { query, token, timeoutMs: 30_000 });

export const getAcabamentos = (id?: number) => apiRequest<ApiAcabamento[]>("/acabamentos", { query: { id } });

export const calcularAcabamento = (body: { idProduto: number; idAcabamento: number; qtdeProduto: number; qtdeAcabamento: number }, token?: string) =>
  apiRequest<Record<string, unknown>>("/calcularacabamento", { method: "POST", body, token });

export const consultarStatusProduto = (idProduto: number) => apiRequest<Record<string, unknown>>("/consultarstatusproduto", { query: { idProduto } });

export const getFeriados = (inicio: Date | string, fim: Date | string) =>
  apiRequest<ApiFeriado[]>("/feriados", { query: { data_inicial: apiDate(inicio), data_final: apiDate(fim) } });

// ---------------------------------------------------------------------------------- clientes

export const getCliente = (token: string) => apiRequest<ApiCliente>("/cliente", { token });

export type CadastroCliente = {
  documento: string;
  nomereduzido?: string;
  nomecompleto?: string;
  emailprincipal: string;
  senha: string;
  inscricaoestadual?: string;
  inscricaomunicipal?: string;
  ramoatividade?: string;
  endereco?: Pick<ApiEndereco, "logradouro" | "numero" | "bairro" | "cidade" | "estado" | "cep"> & { complemento?: string };
  responsavel?: string;
  cpfResponsavel?: string;
  telefone1?: string;
  telefone2?: string;
  emailsecundario?: string;
  tipo?: string;
  nascimento?: string;
};

/** Exige Bearer: quem ainda não tem conta é cadastrado com o token da integração. */
export const cadastrarCliente = (body: CadastroCliente) => apiRequest<Record<string, unknown>>("/cadastrarcliente", { method: "POST", body });

export type AtualizaCliente = { codigo: number; nascimento?: string; telefone1?: string; telefone2?: string; email?: string; senha?: string };
export const atualizaCliente = (body: AtualizaCliente, token: string) => apiRequest<Record<string, unknown>>("/atualizacliente", { method: "POST", body, token });

// ---------------------------------------------------------------------------------- pedidos

export type FiltroPedidos = { pedido?: number; dataInicial?: string; dataFinal?: string; pag?: number; reg?: number };

export const getPedidos = ({ pedido, dataInicial, dataFinal, pag, reg }: FiltroPedidos, token: string) =>
  apiRequest<ApiPedidos>("/pedidos", {
    token,
    query: { pedido, data_inicial: dataInicial ? apiDate(dataInicial) : undefined, data_final: dataFinal ? apiDate(dataFinal) : undefined, pag, reg },
  });

/** O PDF não traz o contrato completo de `produtos` e `pagamento` ("contrato de pedido fornecido para a integração"). */
export type GerarPedido = {
  idCliente: number;
  produtos: unknown[];
  pagamento: Record<string, unknown>;
  tipo_compra: string;
  nome_trabalho: string;
  precoTotal: number;
};
export const gerarPedido = (body: GerarPedido, token?: string) => apiRequest<Record<string, unknown>>("/gerarpedido", { method: "POST", body, token, timeoutMs: 40_000 });

export type AtualizarPagamento = {
  idCliente: number;
  order: number;
  tipo: string;
  status: string;
  codAutorizacao?: string;
  idPagamento?: string;
  parcelas?: number;
  idCobranca?: string;
  idTransacao?: string;
};
export const atualizarPagamento = (body: AtualizarPagamento, token?: string) => apiRequest<Record<string, unknown>>("/atualizarpagamento", { method: "POST", body, token });

export const cancelarCompra = (body: { idCliente: number; order: number; motivo: string; id?: string; proof?: string; auth?: string }, token?: string) =>
  apiRequest<Record<string, unknown>>("/cancelarcompra", { method: "POST", body, token });

export const cancelarPedido = (body: { idCliente: number; pedido: number; motivo: string }, token?: string) =>
  apiRequest<Record<string, unknown>>("/cancelarpedido", { method: "POST", body, token });

export const getContaCorrente = (token: string) => apiRequest<ApiContaCorrente>("/contacorrente", { token });

// ---------------------------------------------------------------------------------- arte e projetos

export const reenviarArte = (body: { idCliente: number; idPedido: number; arte: string; nome: string; url: string }, token?: string) =>
  apiRequest<Record<string, unknown>>("/reenviararte", { method: "POST", body, token, timeoutMs: 60_000 });

export const getProjetosEspeciais = (inicio?: Date | string, fim?: Date | string, token?: string) =>
  apiRequest<unknown[]>("/projetosespeciais", { token, query: { data_inicial: inicio ? apiDate(inicio) : undefined, data_final: fim ? apiDate(fim) : undefined } });

export const gerarProjetoEspecial = (body: { titulo: string; descricao: string; previsao?: string; nome?: string; url?: string }, token?: string) =>
  apiRequest<Record<string, unknown>>("/gerarprojetoespecial", { method: "POST", body, token });

// ---------------------------------------------------------------------------------- multiloja

export const getRevendas = () => apiRequest<ApiRevenda[]>("/multiloja/revendas");
