import "server-only";

import { hkdfSync } from "node:crypto";
import { ordersEnabled, tipoCompraSite } from "@/lib/api/checkout";
import { ApiError, apiUnavailable } from "@/lib/api/client";
import { gerarPedido, getCliente } from "@/lib/api/padrao";
import { groupPrices, linePricesFor, type PriceAccount } from "@/lib/api/prices";
import { seal, unseal } from "@/lib/api/seal";
import { artBase, bunnyConfig, uploadArtFile } from "@/lib/bunny";
import { getProduct, type Product } from "@/lib/catalog";
import { produtoDoGrupo } from "@/lib/catalogo-vivo";
import { publicUrl } from "@/lib/multiloja/config";
import { productFacts } from "@/lib/order-facts";
import {
  addressFromApi,
  buildOrderPayload,
  CANAL_DO_PEDIDO,
  extractOrderNumber,
  isLineError,
  missingArt,
  missingTerms,
  orderDelivery,
  orderTotal,
  priceLine,
  totalsDiffer,
  SEM_TIPO_COMPRA,
  type LineError,
  type LinePrices,
  type OrderItemInput,
  type OrderPayload,
  type OrderRequest,
  type PricedLine,
} from "@/lib/orders";
import { profileOf } from "@/lib/session";
import { MAX_TENTATIVAS, anexosGuardados, classificarFalha, esperaMinutos, pastaGuardados, trocarAnexos, type ClasseFalha, type FalhaApi } from "./regras";
import { concluir, lerArquivo, paraConferir, pegarPendente, reagendar, type EntradaFila } from "./repo";

/*
 * Fechamento do pedido do site, igual no checkout (/api/pedidos) e no reenvio da fila (worker.ts):
 *   1. prepararPedido: GET /cliente com o token do cliente, preços da conta, conferência dos itens (arte, termos de
 *      envio de arte, preço), endereço e o corpo do POST /gerarpedido.
 *   2. enviarPedido: o POST /gerarpedido.
 * Falha de rede em qualquer passo vira { tipo: "falha", classe } (regras.ts): o checkout guarda na fila e o worker
 * decide entre tentar de novo e mandar conferir.
 */

export type Quote = { total: number; reseller: boolean; lines: { key: string; unitPrice: number; total: number; reseller: boolean }[] };

export type Preparo =
  | { tipo: "pronto"; payload: OrderPayload; quote: Quote; total: number; lines: PricedLine[] }
  | { tipo: "sessao" }
  | { tipo: "itens"; items: LineError[] }
  | { tipo: "precos"; quote: Quote }
  | { tipo: "endereco" }
  | { tipo: "falha"; classe: ClasseFalha; erro: unknown };

export type Envio = { tipo: "criado"; numero: number | null } | { tipo: "falha"; classe: ClasseFalha; erro: unknown };

export function falhaDe(error: unknown): FalhaApi {
  return error instanceof ApiError ? { status: error.status, reached: error.reached } : null;
}

/** Texto curto do erro para o admin (sem token nem dado do cliente). */
export function textoDoErro(error: unknown): string {
  if (error instanceof ApiError) return `${error.reached === false ? "sem conexão com a API" : `API respondeu ${error.status}`}: ${error.message}`.slice(0, 300);
  return error instanceof Error ? error.message.slice(0, 300) : "erro desconhecido";
}

/** Item antigo sem grupo: acha pelo slug do produto (ou pelo ID do grupo no começo dele, num produto novo da API). */
export function withGroup(item: OrderItemInput): OrderItemInput {
  if (item.groupId) return item;
  const groupId = getProduct(item.slug)?.groupId ?? (Number(/^(\d+)-/.exec(item.slug)?.[1]) || undefined);
  return groupId ? { ...item, groupId } : item;
}

/** Pastas públicas aceitas nos arquivos da arte: a do Bunny e a dos arquivos guardados no próprio site. */
export function pastasDaArte(origem: string): string[] {
  return [artBase(), pastaGuardados(publicUrl() ?? origem)].filter(Boolean);
}

export async function prepararPedido(pedido: OrderRequest, conta: { id: number; token: string }): Promise<Preparo> {
  const items = pedido.items.map(withGroup);
  let cliente;
  try {
    cliente = await getCliente(conta.token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { tipo: "sessao" };
    return { tipo: "falha", classe: classificarFalha("consulta", falhaDe(error)), erro: error };
  }
  if (!cliente?.id || Number(cliente.id) !== conta.id) return { tipo: "sessao" };
  const profile = profileOf(cliente);
  const account: PriceAccount = { id: conta.id, token: conta.token, reseller: profile.reseller, category: profile.category, priceTable: profile.priceTable };

  const prices = new Map<number, LinePrices>();
  try {
    const groups = [...new Set(items.map((item) => item.groupId).filter((id): id is number => Boolean(id)))];
    await Promise.all(
      groups.map(async (groupId) => {
        const group = await groupPrices(groupId, account);
        if (group) prices.set(groupId, linePricesFor(group, account, { ordersOn: ordersEnabled() }));
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { tipo: "sessao" };
    return { tipo: "falha", classe: classificarFalha("consulta", falhaDe(error)), erro: error };
  }

  const priced = items.map((item) => missingArt(item) ?? missingTerms(item) ?? priceLine(item, item.groupId ? prices.get(item.groupId) : null));
  const problems = priced.filter(isLineError);
  if (problems.length) return { tipo: "itens", items: problems };
  const lines = priced as PricedLine[];

  const total = orderTotal(lines);
  const quote: Quote = { total, reseller: profile.reseller, lines: lines.map((line) => ({ key: line.key, unitPrice: line.unitPrice, total: line.total, reseller: line.reseller })) };
  if (totalsDiffer(total, pedido.expectedTotal)) return { tipo: "precos", quote };

  const registered = addressFromApi(cliente.endereco_entrega) ?? addressFromApi(cliente.endereco_cadastro);
  const deliveryInfo = orderDelivery(pedido.delivery, registered);
  if (!deliveryInfo) return { tipo: "endereco" };

  // Foto, categoria, embalagem e anexos do produto que precificou cada linha (catálogo em tempo real; já em cache).
  const vivos = new Map<number, Product | undefined>();
  await Promise.all([...new Set(lines.map((line) => line.groupId))].map(async (groupId) => vivos.set(groupId, await produtoDoGrupo(groupId))));
  const payload = buildOrderPayload({
    customerId: conta.id,
    lines,
    method: pedido.payment,
    delivery: deliveryInfo,
    facts: (line) => productFacts(line, vivos.get(line.groupId)),
    tipoCompra: tipoCompraSite(),
  });
  return { tipo: "pronto", payload, quote, total, lines };
}

/** POST /gerarpedido. Sem o código de tipo_compra nada sai: volta como recusa (a equipe confere na fila). */
export async function enviarPedido(payload: OrderPayload, token?: string): Promise<Envio> {
  const tipoCompra = payload.tipo_compra;
  if (tipoCompra === null) return { tipo: "falha", classe: "recusado", erro: new Error(SEM_TIPO_COMPRA) };
  try {
    return { tipo: "criado", numero: extractOrderNumber(await gerarPedido({ ...payload, tipo_compra: tipoCompra }, token)) };
  } catch (error) {
    return { tipo: "falha", classe: classificarFalha("pedido", falhaDe(error)), erro: error };
  }
}

// ---------------------------------------------------------------------------------- token selado da fila

function chaveFila(): Buffer {
  const secret = process.env.PADRAO_SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("PADRAO_SESSION_SECRET precisa de pelo menos 32 caracteres aleatórios.");
  return Buffer.from(hkdfSync("sha256", secret, "padrao-color", "fila-pedidos-v1", 32));
}

/** Token do cliente selado para a fila (só o servidor abre; refaz o GET /cliente e os preços no reenvio). */
export function selarToken(token: string): string | null {
  try {
    return seal({ token }, chaveFila());
  } catch {
    return null;
  }
}

function abrirToken(selado: string | null): string | null {
  if (!selado) return null;
  try {
    return unseal<{ token: string }>(selado, chaveFila())?.token ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------- reenvio

/**
 * Arquivos guardados no site sobem para o Bunny (quando ele está configurado) e as URLs do pedido são trocadas.
 * Sem Bunny, ou se ele falhar, o pedido segue com as URLs do site (a produção baixa de lá).
 */
async function subirGuardados(payload: OrderPayload): Promise<OrderPayload> {
  const bunny = bunnyConfig();
  const base = publicUrl();
  if (!bunny || !base) return payload;
  const pasta = pastaGuardados(base);
  const mapa: Record<string, { url: string; nome: string }> = {};
  for (const url of anexosGuardados(payload, pasta)) {
    const nome = url.slice(pasta.length);
    const arquivo = await lerArquivo(nome);
    if (!arquivo) continue;
    try {
      mapa[url] = await uploadArtFile(bunny, { name: nome, bytes: arquivo.bytes.buffer.slice(arquivo.bytes.byteOffset, arquivo.bytes.byteOffset + arquivo.bytes.byteLength) as ArrayBuffer });
    } catch {
      return Object.keys(mapa).length ? trocarAnexos(payload, mapa) : payload;
    }
  }
  return Object.keys(mapa).length ? trocarAnexos(payload, mapa) : payload;
}

export type Reenvio = { protocolo: string; resultado: "enviado" | "simulado" | "pendente" | "conferir"; mensagem: string };

/**
 * Tenta mandar uma entrada da fila para a produção (a próxima pendente, ou a `id` pedida no admin). Com o disjuntor da
 * API aberto (client.ts), nem tenta: a próxima volta do worker repete.
 */
export async function reenviar(id?: number): Promise<Reenvio | null> {
  if (apiUnavailable()) return null;
  const entrada = await pegarPendente(id);
  if (!entrada) return null;
  try {
    return await processarEntrada(entrada);
  } catch (error) {
    // Erro inesperado no meio: não se sabe se o pedido saiu.
    const erro = textoDoErro(error);
    await paraConferir(entrada.id, { erro });
    return { protocolo: entrada.protocolo, resultado: "conferir", mensagem: erro };
  }
}

async function processarEntrada(entrada: EntradaFila): Promise<Reenvio> {
  const token = abrirToken(entrada.token);
  const semConexao = async (erro: unknown, payload?: unknown): Promise<Reenvio> => {
    const texto = textoDoErro(erro);
    if (entrada.tentativas + 1 >= MAX_TENTATIVAS) {
      await paraConferir(entrada.id, { erro: `${MAX_TENTATIVAS} tentativas sem conexão (${texto})`, payload });
      return { protocolo: entrada.protocolo, resultado: "conferir", mensagem: texto };
    }
    await reagendar(entrada.id, { erro: texto, esperaMin: esperaMinutos(entrada.tentativas + 1), payload });
    return { protocolo: entrada.protocolo, resultado: "pendente", mensagem: texto };
  };
  const conferir = async (erro: string, payload?: unknown): Promise<Reenvio> => {
    await paraConferir(entrada.id, { erro, payload });
    return { protocolo: entrada.protocolo, resultado: "conferir", mensagem: erro };
  };

  // Sem o corpo do gerarpedido (a API caiu antes, no cliente ou nos preços): refaz o fechamento com o token do cliente.
  let payload = entrada.payload as OrderPayload | null;
  if (!payload) {
    if (!token) return conferir("Sem o token do cliente para refazer a consulta de preços: confira com o cliente.");
    const preparo = await prepararPedido(entrada.pedido, { id: entrada.clienteId, token });
    if (preparo.tipo === "falha") return preparo.classe === "sem-conexao" ? semConexao(preparo.erro) : conferir(textoDoErro(preparo.erro));
    if (preparo.tipo === "sessao") return conferir("A sessão do cliente venceu antes do reenvio: o pedido precisa ser refeito com o cliente.");
    if (preparo.tipo === "itens") return conferir(`Itens com problema: ${preparo.items.map((i) => `${i.name} (${i.error})`).join("; ")}`.slice(0, 300));
    if (preparo.tipo === "precos") return conferir(`O total mudou de ${entrada.pedido.expectedTotal.toFixed(2)} para ${preparo.quote.total.toFixed(2)}: confirme com o cliente.`);
    if (preparo.tipo === "endereco") return conferir("O cadastro do cliente ficou sem endereço de entrega completo.");
    payload = preparo.payload;
  }

  if (!ordersEnabled()) {
    await concluir(entrada.id, { numero: null, simulado: true, payload, texto: "Simulado (PADRAO_ORDERS_ENABLED desligado): nada foi enviado à Padrão." });
    return { protocolo: entrada.protocolo, resultado: "simulado", mensagem: "Simulado: o envio de pedidos está desligado." };
  }

  // Guardado antes do código de tipo_compra (ou com o "Site" antigo, que a API recusa): vale o código configurado agora.
  if (typeof payload.tipo_compra !== "number") payload = { ...payload, tipo_compra: tipoCompraSite(), envio: CANAL_DO_PEDIDO };
  if (payload.tipo_compra === null) return conferir(SEM_TIPO_COMPRA, payload);

  payload = await subirGuardados(payload);
  const envio = await enviarPedido(payload, token ?? undefined);
  if (envio.tipo === "criado") {
    const numero = envio.numero ? String(envio.numero) : null;
    await concluir(entrada.id, { numero, simulado: false, payload, texto: numero ? `Enviado à Padrão: pedido ${numero}.` : "Enviado à Padrão (sem número na resposta)." });
    return { protocolo: entrada.protocolo, resultado: "enviado", mensagem: numero ? `Pedido ${numero} criado na Padrão.` : "Pedido criado na Padrão." };
  }
  if (envio.classe === "sem-conexao") return semConexao(envio.erro, payload);
  return conferir(envio.classe === "recusado" ? `A API recusou o pedido: ${textoDoErro(envio.erro)}` : `Sem confirmação da API (pode ter sido criado): ${textoDoErro(envio.erro)}`, payload);
}
