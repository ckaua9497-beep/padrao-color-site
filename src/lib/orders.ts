import type { ApiEndereco } from "./api/types";
import type { CustomSize, Variation } from "./catalog";
import { orderAttachments, parseUploadedFiles, parseUploadedPreview, type ArtAttachment, type UploadedArtFile, type UploadedPreview } from "./art-files.ts";
import { cotarAcabamentos, parseAcabamentosEscolhidos, resumoAcabamentos, type Acabamento, type AcabamentoEscolhido, type CotacaoAcabamentos } from "./acabamentos.ts";
import { areaQuote, areaRules, cleanOptionLabel } from "./pricing.ts";
import { isValidCep, isValidUf, onlyDigits } from "./api/validation.ts";
import { aceiteValido, levaArte, textoDoAceite, type AceiteTermos } from "./termos-arte.ts";
import { addBusinessDays, brDate, brasiliaClock, feriadosNacionais, inicioDaContagem, type Relogio } from "./dias-uteis.ts";
import { ENTREGA_ROTA, ENTREGA_TRANSPORTADORA, LOJAS_RETIRADA, LOJA_PADRAO, lojaDoCodigo, lojaRetirada, pagaNaRetiradaPermitido, type ModoEntrega } from "./entrega.ts";
import type { RotaDoCliente } from "./cliente";
import type { OpcaoFrete } from "./frete";

/*
 * Pedido do site para a API (POST /gerarpedido) — mapeamento explícito, tipado e isolado.
 *
 * Formato do exemplo de pedido aceito que a Padrão mandou (pedido do site atual, 09/10/2026; alinhado em 03/11/2026 a
 * pedido do usuário, `../retornos-api/exemplo-pedido-padrao-09-10.json`). O PDF mostra outro envelope ({idCliente,
 * produtos, pagamento, tipo_compra, nome_trabalho, precoTotal}), mas o pedido aceito não tem tipo_compra, nome_trabalho
 * nem precoTotal, e eles saíram.
 * - Envelope: data e hora (Brasília), entrega, previsao (o maior prazo em dias úteis, sem fim de semana nem os feriados
 *   do GET /feriados, contando de hoje só até as 18h: dias-uteis.ts), produtos, idCliente e pagamento {tipo, valor, status}.
 * - Produto: id (variação), arte {tipo, preco, anexos[{url, nome, tipoArquivo}]}, price (um lote), groupId, package
 *   (embalagem da variação), descricao, precoTotal, quantidade (lotes), variations (as opções da variação, com o rótulo
 *   limpo), productName, productType, nomeTrabalho, productImage, tipoProducao ("expresso"/"economico"), desc_trabalho,
 *   nome_trabalho, productionTime (dias úteis), groupCategoryId, tratamentoArquivo e precoTotalAcabamentos.
 * - Fora do exemplo, só onde ele não cobre o caso: `arte.web2print` (pedido da Padrão de 03/11/2026), `credito_usado`
 *   no envelope quando a compra usa créditos, e o endereço e o serviço da transportadora em `entrega`.
 * Premissas a confirmar com a Padrão (trocar aqui):
 * - arte.tipo = 1 com a arte do cliente (o exemplo traz 1 com anexo); sem arquivo, vai com anexos vazio (cliente manda
 *   depois). Criação de arte pela equipe (preço da variação, `criacao_arte`): arte.tipo = 2 e arte.preco = o preço dela,
 *   somado ao total do item e do pedido; o pedido do cliente vai em desc_trabalho e as referências em anexos.
 * - arte.web2print = "SIM" quando a arte do item foi montada no editor do site (Web to Print: o item leva o PDF que o site
 *   gera, no gabarito ou na área da arte), "NAO" nos outros casos (arquivo pronto do cliente, criação pela equipe, produto
 *   sem arquivo). Pedido da Padrão de 03/11/2026 ("colocar um identificador via API de que a arte foi produzida via Web to
 *   Print"); o nome e os valores são os do `customizacao.web2print` do GET /produtos, a confirmar. A descrição do
 *   trabalho também diz "Arte feita no Web to Print do site".
 * - "Nome da arte" vira o nome do trabalho do item e "Observação" vai em descricao.
 * - anexos: os arquivos do Bunny (art-files.ts), com o tipo de anexo que a variação aceita (customizacao.ts); a
 *   variação sem personalização ou de neon pronto vai sem anexos.
 * - tipoProducao "economico" no prazo normal (o exemplo só mostra "expresso"); productType 0; tratamentoArquivo
 *   "Padrão" (o site não vende esse serviço).
 * - Acabamentos extras (acabamentos.ts): o valor vai em precoTotalAcabamentos e a lista em desc_trabalho
 *   ("Acabamentos: Serrilha (2×)…"); precoTotal do item = price × quantidade (só o produto). O prazo dos acabamentos
 *   entra em productionTime e na previsão.
 * - entrega (entregaDoPedido): sempre {id, taxaEntrega}, como o site atual manda (modelo e códigos da Padrão de
 *   05/11/2026: os pedidos de teste do site novo chegaram sem o tipo de entrega porque iam sem `id`). id "S" = Delivery
 *   Padrão (rota), "F" = transportadora, a letra da loja na retirada ("J" = Loja São João…, entrega.ts). taxaEntrega = o
 *   frete que o pedido cobra: a taxa da rota quando ela entra no pedido (0 com o pagamento na retirada liberado), o
 *   serviço da transportadora cotado, 0 na retirada; entra no pagamento.valor. A retirada leva também o nome da loja (o
 *   exemplo de 09/10 traz {id: "J", nome: "Loja São João"}); a transportadora, o endereço de entrega e o serviço
 *   escolhido (endereco, transportadora {servico, nome, prazo} | null = frete combinado), que o modelo não tem.
 * - pagamento "retirada": tipo "Pagamento na Retirada" (como no exemplo), só com a liberação no cadastro, no Delivery
 *   Padrão ou numa loja própria. Pix e cartão: "PIX" e "Cartão de Crédito" (nomes a confirmar). Sem boleto (a Padrão
 *   não trabalha com boleto, 26/10/2026). status 0 = aguardando.
 * - pagamento.valor = o que é pago na forma de pagamento.tipo: no exemplo, o total do pedido. Créditos Padrão Color
 *   (creditos.ts, revisão da Padrão de 29/10/2026): a parte paga com eles vai em `credito_usado` (o nome do GET /pedidos),
 *   e pagamento.valor fica com o resto; pago todo com créditos, pagamento.tipo = "Crédito" e valor = os créditos.
 * - Sem tipo_compra nem envio: o exemplo não tem, e os pedidos do site antigo aparecem com envio "Site" no GET /pedidos.
 * - Medida livre (m²): quantidade = peças, price = total ÷ peças e precoTotal = total do item, porque o mínimo de 1 m²
 *   vale no item inteiro (revisão da Padrão de 25/10/2026); a medida vai em desc_trabalho. O kit também.
 * - Total do pedido (totalDoPedido): a soma dos itens (produto, acabamentos e criação de arte) mais o frete, no preço
 *   do cliente (balcão ou revenda); = pagamento.valor + credito_usado. Sem desconto no PIX (revisão de 25/10/2026).
 * O servidor recalcula tudo a partir da variação: o preço que vem do navegador só serve para comparar.
 */

/** Sem boleto: a Padrão não trabalha com boleto (26/10/2026). "retirada" = pagar na retirada ou na entrega pela rota. */
export type PaymentMethod = "pix" | "cartao" | "retirada";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; hint: string; apiType: string }> = {
  pix: { label: "Pix", hint: "Pagamento instantâneo", apiType: "PIX" },
  cartao: { label: "Cartão de crédito", hint: "Pagamento com cartão de crédito", apiType: "Cartão de Crédito" },
  retirada: { label: "Pagar na retirada", hint: "Liberado no seu cadastro: você paga ao receber ou retirar o pedido", apiType: "Pagamento na Retirada" },
};

/** Pedido pago todo com os créditos da conta corrente (creditos.ts). */
export const PAGAMENTO_CREDITO = { label: "Créditos Padrão Color", apiType: "Crédito" } as const;

export const isPaymentMethod = (value: unknown): value is PaymentMethod => typeof value === "string" && value in PAYMENT_METHODS;

/** Item do carrinho como o checkout manda para o servidor (sem miniaturas). */
export type OrderItemInput = {
  key: string;
  slug: string;
  name: string;
  groupId?: number;
  variationId?: number;
  /** Lotes: quantas vezes a quantidade de tabela (ex.: 2 × 1000 cartões). */
  quantity: number;
  widthCm?: number;
  heightCm?: number;
  express?: boolean;
  options: Record<string, string>;
  artName: string | null;
  bundle?: { id: string; name: string } | null;
  /** Preço de um lote que o cliente viu: só para comparar com o do servidor. */
  unitPrice: number;
  /** Arquivos da arte já no Bunny (URL pública da pasta de uploads): vão em arte.anexos. */
  files?: UploadedArtFile[];
  /** Imagem da arte no gabarito, só para "Artes enviadas" em Meus pedidos (src/lib/artes-enviadas): não vai no pedido. */
  previa?: UploadedPreview | null;
  /** Acabamentos extras escolhidos (serrilha, furo, laminação…): o servidor recalcula o preço pelo catálogo. */
  acabamentos?: AcabamentoEscolhido[];
  /** Aceite dos termos de envio de arte (termos-arte.ts): obrigatório no item personalizado. */
  termosArte?: AceiteTermos | null;
  /** Criação de arte pela equipe da Padrão: o servidor cobra o preço da variação (catálogo). */
  criacaoArte?: boolean;
};

/** Preços do cliente para um grupo: variações já com o desconto da categoria de revenda, se houver. */
export type LinePrices = {
  groupId: number;
  variations: Variation[];
  customSize?: CustomSize | null;
  /** LED Neon montado pelo cliente (Frase/Logotipo): cobrança mínima de 0,25 m² por peça, sem o mínimo do item. */
  neon?: "frase" | "logo" | null;
  reseller: boolean;
  /** Mínimo/máximo de unidades do produto (qtde_minima/qtde_maxima), para produtos vendidos por unidade. */
  limits?: { minQty: number; maxQty: number } | null;
  /** false = produto que a Padrão ainda não tem cadastrado (produto novo do site): não entra no pedido online. */
  orderable?: boolean;
  /** Acabamentos extras do produto (catálogo): a tabela e os índices de cada variação (id → índices). */
  acabamentos?: { tabela: Acabamento[]; porVariacao: Record<string, number[]> } | null;
  /** Preço da criação de arte por variação (id → preço; customizacao.ts criacaoPorVariacao). */
  criacao?: Record<string, number> | null;
};

export type PricedLine = {
  key: string;
  name: string;
  groupId: number;
  variation: Variation & { id: number };
  input: OrderItemInput;
  express: boolean;
  /** Preço de um lote (já com área, prazo e desconto de revenda), sem os acabamentos extras. */
  unitPrice: number;
  /**
   * Só o produto, sem os acabamentos: unitPrice × lotes, ou o total da área (m²), em que o mínimo de 1 m² vale no item
   * inteiro e o preço por peça é só a divisão.
   */
  productTotal: number;
  lotSize: number;
  lots: number;
  units: number;
  /** Produto (productTotal) mais os acabamentos extras e a criação de arte. */
  total: number;
  /** Preço da criação de arte pela equipe (0 sem ela). */
  criacao: number;
  /** Acabamentos extras escolhidos, com preço e prazo (vazio quando não há). */
  acabamentos: CotacaoAcabamentos;
  /** Prazo do produto mais o dos acabamentos. */
  leadDays: number | null;
  /** Medida livre: área de uma peça, a cobrada de uma peça e a cobrada no item (com o mínimo de 1 m²). */
  size: { widthCm: number; heightCm: number; areaM2: number; billedAreaM2: number; billedTotalM2: number } | null;
  reseller: boolean;
};

export type LineError = { key: string; name: string; error: string };

/** Produto novo (API própria do site): o pedido é fechado pelo atendimento até a Padrão cadastrar o item. */
export const NEW_PRODUCT_ORDER = "Produto novo: o pedido deste item é fechado pelo atendimento. Remova-o do carrinho e fale com a gente pelo WhatsApp.";

export function isLineError(line: PricedLine | LineError): line is LineError {
  return "error" in line;
}

/** Item sem arte na loja principal (carrinho de antes da retirada do "Enviar arte depois"). */
export const MISSING_ART = "Este item está sem arte. Abra o produto, envie a arte ou escreva o texto e adicione de novo.";

/**
 * A loja principal não aceita "enviar arte depois" (revisão da Padrão de 25/10/2026): todo item chega com a linha da
 * arte (arquivo, texto, "produto sem impressão" ou "modelo pronto"). As lojas da multiloja recebem a arte depois.
 */
export function missingArt(input: Pick<OrderItemInput, "key" | "name" | "artName">): LineError | null {
  return input.artName ? null : { key: input.key, name: input.name, error: MISSING_ART };
}

export const MISSING_TERMS = "Aceite os termos de envio de arte para este item personalizado.";

/** Item personalizado sem o aceite dos termos de envio de arte (termos-arte.ts). */
export function missingTerms(input: Pick<OrderItemInput, "key" | "name" | "artName" | "termosArte">): LineError | null {
  return levaArte(input) && !input.termosArte ? { key: input.key, name: input.name, error: MISSING_TERMS } : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Variação pelas opções escolhidas (itens antigos sem variationId). As chaves do carrinho são os rótulos
 * limpos ("Papel"), as da variação vêm numeradas ("1 - Papel").
 */
export function resolveVariationId(variations: Variation[], options: Record<string, string>): number | undefined {
  const candidates = variations.filter((variation) => {
    const keys = Object.keys(variation.v);
    return keys.length > 0 && keys.every((key) => options[cleanOptionLabel(key)] === variation.v[key]);
  });
  return candidates.length === 1 ? candidates[0].id : undefined;
}

/** Preço do item com a tabela do cliente. Erro quando a variação sumiu ou a medida saiu dos limites. */
export function priceLine(input: OrderItemInput, prices: LinePrices | null | undefined): PricedLine | LineError {
  const fail = (error: string): LineError => ({ key: input.key, name: input.name, error });
  if (!prices) return fail("Produto indisponível para compra pelo site. Remova o item ou fale com o atendimento.");
  if (prices.orderable === false) return fail(NEW_PRODUCT_ORDER);
  const variationId = input.variationId ?? resolveVariationId(prices.variations, input.options);
  const variation = variationId ? prices.variations.find((v) => v.id === variationId) : undefined;
  if (!variation || variation.id === undefined) return fail("Esta opção do produto não está mais disponível. Remova o item e escolha de novo.");

  const expressPrice = variation.pe && variation.pe > 0 ? variation.pe : null;
  const express = Boolean(input.express && expressPrice);
  const base = express && expressPrice ? expressPrice : variation.p;
  if (!(base > 0)) return fail("Produto sem preço de tabela. Fale com o atendimento para orçar.");

  let unitPrice = base;
  let productTotal: number | null = null;
  let size: PricedLine["size"] = null;
  if (input.widthCm !== undefined || input.heightCm !== undefined) {
    // Limites da variação e mínimos de cobrança (1 m² no item; 0,25 m² por peça no LED), como na página do produto.
    const area = areaQuote(base, input.widthCm ?? 0, input.heightCm ?? 0, areaRules({ customSize: prices.customSize, neon: prices.neon ?? undefined }, variation, { lines: input.options.Subtexto ? 2 : 1 }), input.quantity);
    if (area.error) return fail(area.error);
    unitPrice = area.price;
    productTotal = area.total;
    size = { widthCm: input.widthCm ?? 0, heightCm: input.heightCm ?? 0, areaM2: area.area, billedAreaM2: area.billedArea, billedTotalM2: area.billedTotal };
  }
  unitPrice = round2(unitPrice);
  const lotSize = variation.q || 1;
  // Vendido por unidade (não por lote nem por m²): respeita o mínimo e o máximo da faixa da variação
  // (Caderno "De 11 até 100") ou, sem faixa própria, os do produto.
  const units = input.quantity * lotSize;
  if (!size && lotSize <= 1 && prices.limits) {
    const minQty = variation.mn ?? prices.limits.minQty;
    const maxQty = variation.mx ?? prices.limits.maxQty;
    if (minQty > 1 && units < minQty) return fail(`Quantidade mínima: ${minQty.toLocaleString("pt-BR")} unidades.`);
    if (maxQty > 0 && units > maxQty) return fail(`Quantidade máxima: ${maxQty.toLocaleString("pt-BR")} unidades. Para mais, escolha a versão para lotes maiores.`);
  }
  // Acabamentos extras: só os que a variação aceita, com o preço do catálogo (o do navegador não vale).
  const tabela = prices.acabamentos?.tabela ?? [];
  const disponiveis = (prices.acabamentos?.porVariacao[String(variation.id)] ?? []).map((i) => tabela[i]).filter((a): a is Acabamento => Boolean(a));
  const acabamentos = cotarAcabamentos(disponiveis, input.acabamentos, units);
  if (!acabamentos) return fail("Um acabamento escolhido não está mais disponível para esta opção. Remova o item e escolha de novo.");
  // Criação de arte: uma vez no item, com o preço do catálogo (o do navegador não vale).
  const criacao = input.criacaoArte ? (prices.criacao?.[String(variation.id)] ?? 0) : 0;
  if (input.criacaoArte && !(criacao > 0)) return fail("A criação de arte não está disponível para esta opção. Remova o item e envie a sua arte.");
  const leadDays = express ? (variation.de ?? variation.d) : variation.d;
  return {
    key: input.key,
    name: input.name,
    groupId: prices.groupId,
    variation: { ...variation, id: variation.id },
    input,
    express,
    unitPrice,
    productTotal: productTotal ?? round2(unitPrice * input.quantity),
    lotSize,
    lots: input.quantity,
    units,
    total: round2((productTotal ?? unitPrice * input.quantity) + acabamentos.total + criacao),
    criacao,
    acabamentos,
    leadDays: leadDays !== null && leadDays !== undefined ? leadDays + acabamentos.prazo : null,
    size,
    reseller: prices.reseller,
  };
}

/** Total do pedido: a soma dos itens, igual em qualquer forma de pagamento (sem desconto no PIX). */
export function orderTotal(lines: { total: number }[]): number {
  return round2(lines.reduce((sum, line) => sum + line.total, 0));
}

/** O total mudou mais que um centavo? */
export function totalsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.009;
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** Título do kit/festa: "Kit Casamento" ou "Crie Sua Festa — Aniversário" (opção "Festa" do item). */
export function bundleTitle(bundle: { id: string; name: string }, options: Record<string, string>): string {
  const party = (options.Festa ?? "").trim();
  return party && !bundle.name.toLowerCase().includes(party.toLowerCase()) ? `${bundle.name} — ${party}` : bundle.name;
}

/** Nome do trabalho do item: o texto da arte, senão o nome do produto. */
export function itemJobName(input: Pick<OrderItemInput, "name" | "options">): string {
  const text = (input.options["Nome da arte"] ?? input.options["Texto da arte"] ?? input.options.Subtexto ?? "").trim();
  return clip(text || input.name, 60);
}

// ---------------------------------------------------------------------------------- entrega

export type DeliveryAddress = { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string };

/**
 * Entrega escolhida no checkout (entrega.ts). "rota" = Delivery Padrão no endereço do cadastro; "transportadora" leva o
 * endereço (null = o do cadastro) e o serviço da cotação (null = sem cotação: frete combinado com o atendimento).
 * "cadastro" e "outro" são do checkout antigo (pedidos guardados na fila antes da entrega nova): entrega sem frete.
 */
export type DeliveryChoice =
  | { kind: "rota" }
  | { kind: "retirada"; loja?: number }
  | { kind: "transportadora"; address: DeliveryAddress | null; servico: number | null }
  | { kind: "cadastro" }
  | { kind: "outro"; address: DeliveryAddress };

export type OrderDelivery = {
  tipo: "Delivery Padrão" | "Retirada" | "Transportadora" | "Entrega";
  endereco: DeliveryAddress | null;
  /** Rota da Padrão (Delivery Padrão): o nome, a taxa e se ela entra no pedido. */
  rota?: { nome: string; taxa: number; cobrada: boolean };
  /** Loja ou ponto de retirada (id do site oficial). */
  loja?: { id: number; nome: string };
  /** Serviço cotado na API de frete; null = combinado com o atendimento. */
  transportadora?: { servico: number; nome: string; prazo: string } | null;
  /** Frete cobrado no pedido (sem o campo, 0). */
  frete?: number;
};

/** Modo de entrega da escolha (o checkout antigo vira transportadora). */
export function modoDaEntrega(choice: DeliveryChoice): ModoEntrega {
  return choice.kind === "rota" || choice.kind === "retirada" ? choice.kind : "transportadora";
}

export function addressProblem(address: DeliveryAddress): string | null {
  if (!isValidCep(address.cep)) return "Informe um CEP válido.";
  if (address.logradouro.trim().length < 3) return "Informe a rua.";
  if (!address.numero.trim()) return "Informe o número (ou S/N).";
  if (address.cidade.trim().length < 2) return "Informe a cidade.";
  if (!isValidUf(address.estado)) return "Informe a UF.";
  return null;
}

/** Endereço do GET /cliente → endereço de entrega; null quando não tem rua. */
export function addressFromApi(endereco: Partial<ApiEndereco> | null | undefined): DeliveryAddress | null {
  if (!endereco?.logradouro?.trim()) return null;
  return {
    cep: onlyDigits(endereco.cep ?? ""),
    logradouro: endereco.logradouro.trim(),
    numero: (endereco.numero ?? "").trim(),
    complemento: (endereco.complemento ?? "").trim(),
    bairro: (endereco.bairro ?? "").trim(),
    cidade: (endereco.cidade ?? "").trim(),
    estado: (endereco.estado ?? "").trim().toUpperCase(),
  };
}

export const SEM_ENDERECO = "Seu cadastro não tem endereço de entrega completo. Escolha a retirada ou informe outro endereço na transportadora.";

/**
 * Entrega do pedido, com o frete que ele cobra; texto = o que impede (mostrado ao cliente). `transportadora`: a opção
 * cotada agora para o serviço escolhido (null = sem cotação possível: frete combinado).
 */
export function orderDelivery(
  choice: DeliveryChoice,
  { registered, rota, transportadora = null }: { registered: DeliveryAddress | null; rota: RotaDoCliente; transportadora?: Pick<OpcaoFrete, "id" | "preco"> & { nome: string; prazo: string } | null },
): OrderDelivery | string {
  const cadastro = registered && !addressProblem(registered) ? registered : null;
  if (choice.kind === "retirada") {
    const loja = lojaRetirada(choice.loja ?? LOJA_PADRAO);
    return loja ? { tipo: "Retirada", endereco: null, loja: { id: loja.id, nome: loja.nome }, frete: 0 } : "Escolha a loja de retirada.";
  }
  if (choice.kind === "rota") {
    if (rota.tipo !== "rota") return "Seu endereço não tem rota de entrega da Padrão Color: escolha a retirada ou a transportadora.";
    if (!cadastro) return SEM_ENDERECO;
    return { tipo: "Delivery Padrão", endereco: cadastro, rota: { nome: rota.nome, taxa: rota.taxa, cobrada: rota.cobradaNoPedido }, frete: rota.cobradaNoPedido ? rota.taxa : 0 };
  }
  if (choice.kind === "transportadora") {
    const endereco = choice.address ?? cadastro;
    if (!endereco) return SEM_ENDERECO;
    if (choice.servico !== null && transportadora?.id !== choice.servico) return "A forma de entrega escolhida não está mais disponível. Escolha de novo.";
    const servico = choice.servico !== null && transportadora ? { servico: transportadora.id, nome: transportadora.nome, prazo: transportadora.prazo } : null;
    return { tipo: "Transportadora", endereco, transportadora: servico, frete: servico ? round2(transportadora!.preco) : 0 };
  }
  if (choice.kind === "outro") return { tipo: "Entrega", endereco: choice.address, frete: 0 };
  return cadastro ? { tipo: "Entrega", endereco: cadastro, frete: 0 } : SEM_ENDERECO;
}

/** O pagamento escolhido vale para esta entrega? (Pagar na retirada só com a liberação e onde a Padrão recebe.) */
export function paymentProblem(method: PaymentMethod, choice: DeliveryChoice, liberado: boolean): string | null {
  if (method !== "retirada") return null;
  return pagaNaRetiradaPermitido({ liberado, modo: modoDaEntrega(choice), loja: choice.kind === "retirada" ? choice.loja : null })
    ? null
    : "O pagamento na retirada não vale para esta entrega. Escolha Pix ou cartão.";
}

// ---------------------------------------------------------------------------------- datas

/**
 * Previsão do pedido: o maior prazo de produção dos itens, em dias úteis a partir do dia em que a produção começa a
 * contar (hoje até as 18h de um dia útil; senão, o próximo dia útil). `holidays` = GET /feriados (feriados.ts).
 */
export function orderForecast(clock: Pick<Relogio, "iso" | "hora">, leadDays: (number | null)[], holidays: ReadonlySet<string> = feriadosNacionais(Number(clock.iso.slice(0, 4)))): string | null {
  const days = leadDays.filter((value): value is number => typeof value === "number" && value > 0);
  if (!days.length) return null;
  return brDate(addBusinessDays(inicioDaContagem(clock, holidays), Math.max(...days), holidays));
}

// ---------------------------------------------------------------------------------- payload

/** Dados do catálogo que o pedido leva de cada item (o servidor busca pelo slug e pela variação). */
export type ProductFacts = {
  image: string;
  categoryId: number | null;
  /** Embalagem da variação: [peso kg, largura, altura, comprimento cm, lotes por caixa]. */
  packaging: readonly [number, number, number, number, number] | null;
  /** Tipos de anexo que a variação aceita ("Arquivo Único", "Impressão Frente", "Faca de Corte"…). */
  attachments: readonly string[];
  /** Variação sem personalização ou neon de modelo pronto: nenhum arquivo vai no pedido. */
  semArquivo?: boolean;
};

export type OrderPackage = { peso: number; altura: number; largura: number; comprimento: number };

/** web2print: "SIM" = arte montada no editor do site (Web to Print), como o `customizacao.web2print` do GET /produtos. */
export type OrderArt = { tipo: number; preco: number; web2print: "SIM" | "NAO"; anexos: ArtAttachment[] };

export type OrderProduct = {
  /** Produto da API (a variação escolhida). */
  id: number;
  groupId: number;
  groupCategoryId: number | null;
  productName: string;
  productImage: string;
  productType: number;
  /** Lotes da variação (2 × "1000 cartões" = 2); peças no m² e na grade de vestuário. */
  quantidade: number;
  /** Preço de um lote (já com medida, prazo e a tabela do cliente). */
  price: number;
  precoTotal: number;
  /** Opções da variação com o rótulo limpo ("Formato": "9x5 cm"). */
  variations: Record<string, string>;
  descricao: string;
  nomeTrabalho: string;
  nome_trabalho: string;
  /** A arte e o que o site acrescenta ao item (texto, estilo, tamanhos, medida, kit). */
  desc_trabalho: string;
  tipoProducao: "expresso" | "economico";
  /** Prazo de produção em dias úteis. */
  productionTime: number | null;
  package: OrderPackage | null;
  arte: OrderArt;
  tratamentoArquivo: { tipo: string; preco: number };
  precoTotalAcabamentos: number;
};

/** Como no exemplo da Padrão: valor = o que é pago na forma `tipo` (sem créditos, o total do pedido). */
export type OrderPayment = { tipo: string; valor: number; status: number };

/**
 * Entrega do pedido como o site atual da Padrão manda: {id: código de entrega, taxaEntrega: frete cobrado no pedido}
 * ("S" rota, "F" transportadora, a letra da loja na retirada). A retirada leva o nome da loja; a transportadora, o
 * endereço e o serviço.
 */
export type EntregaDoPedido = {
  id: string;
  taxaEntrega: number;
  nome?: string;
  endereco?: DeliveryAddress;
  transportadora?: { servico: number; nome: string; prazo: string } | null;
};

/** O pedido no formato do exemplo aceito (cabeçalho do arquivo). */
export type OrderPayload = {
  data: string;
  hora: string;
  entrega: EntregaDoPedido;
  previsao: string | null;
  produtos: OrderProduct[];
  idCliente: number;
  pagamento: OrderPayment;
  /** Só quando a compra usa créditos Padrão Color: a parte paga com eles (o resto em pagamento.valor). */
  credito_usado?: number;
};

/** Entrega do pedido no formato da Padrão; o pedido antigo sem loja retira em São João de Meriti. */
export function entregaDoPedido(delivery: OrderDelivery): EntregaDoPedido {
  if (delivery.tipo === "Retirada") {
    const loja = lojaRetirada(delivery.loja?.id) ?? lojaRetirada(LOJA_PADRAO)!;
    return { id: loja.codigo, taxaEntrega: 0, nome: loja.nome };
  }
  const taxaEntrega = round2(Math.max(0, delivery.frete ?? 0));
  if (delivery.tipo === "Delivery Padrão") return { id: ENTREGA_ROTA, taxaEntrega };
  // Transportadora, e a entrega no endereço do checkout antigo e da multiloja (sempre por transportadora).
  return { id: ENTREGA_TRANSPORTADORA, taxaEntrega, ...(delivery.endereco ? { endereco: delivery.endereco } : {}), transportadora: delivery.transportadora ?? null };
}

/** Frete do pedido: a taxaEntrega (a retirada nunca cobra). */
export const freteDoPedido = (entrega: EntregaDoPedido): number => round2(Math.max(0, Number(entrega.taxaEntrega) || 0));

/** Total do pedido: os itens (produto, acabamentos e criação de arte) mais o frete; = pagamento.valor + credito_usado. */
export function totalDoPedido(payload: Pick<OrderPayload, "produtos" | "entrega">): number {
  const itens = payload.produtos.reduce((soma, p) => soma + Math.round((p.precoTotal + p.precoTotalAcabamentos + p.arte.preco) * 100), 0) / 100;
  return round2(itens + freteDoPedido(payload.entrega));
}

const NO_FACTS: ProductFacts = { image: "", categoryId: null, packaging: null, attachments: [] };

/** arte.tipo do pedido: a arte do cliente (como no exemplo da Padrão) ou a criação pela equipe (a confirmar). */
export const ARTE_DO_CLIENTE = 1;
export const ARTE_CRIACAO = 2;

/** Rótulo limpo da opção ("02 - Formato:" → "Formato"). */
const optionLabel = (key: string) => cleanOptionLabel(key).replace(/:$/, "").trim();

/**
 * A arte do item foi montada no editor do site (Web to Print)? É quando ele leva o PDF que o site gera (no gabarito ou na
 * área da arte); arquivo pronto do cliente, criação pela equipe e produto sem arquivo não contam.
 */
export function artePeloWebToPrint(line: Pick<PricedLine, "input" | "criacao">, facts: Pick<ProductFacts, "semArquivo"> = NO_FACTS): boolean {
  return !facts.semArquivo && !(line.criacao > 0) && (line.input.files ?? []).some((file) => file.kind === "pdf");
}

/** O que o item leva além das opções da variação: a linha da arte e as opções do site (texto, kit, tamanhos…). */
function workDescription(line: PricedLine, variationLabels: Set<string>, w2p: boolean): string {
  const art = `${line.input.artName ? `Arte: ${line.input.artName}` : "Arte: enviar depois"}${w2p ? " · Arte feita no Web to Print do site" : ""}`;
  // Os acabamentos vêm da cotação do servidor (a linha "Acabamentos" do carrinho é só exibição).
  // A observação vai em descricao (não repete aqui).
  const extras = Object.entries(line.input.options)
    .filter(([key]) => !variationLabels.has(optionLabel(key)) && optionLabel(key) !== "Acabamentos" && optionLabel(key) !== "Observação")
    .map(([key, value]) => `${key}: ${value}`);
  // Medida livre e kit: o exemplo da Padrão não tem campo para eles (saíram largura/altura/area e kit do produto).
  const medida = line.size && !extras.some((extra) => extra.startsWith("Medida:")) ? [`Medida: ${cm(line.size.widthCm)} × ${cm(line.size.heightCm)} cm`] : [];
  const kit = line.input.bundle ? [`Kit: ${bundleTitle(line.input.bundle, line.input.options)}`] : [];
  const finishing = line.acabamentos.itens.length ? [`Acabamentos: ${resumoAcabamentos(line.acabamentos.itens)}`] : [];
  const termos = line.input.termosArte ? [`Termos de envio de arte: ${textoDoAceite(line.input.termosArte)}`] : [];
  return clip([art, ...kit, ...extras, ...medida, ...finishing, ...termos].join(" · "), 1000);
}

/** Número com vírgula, como nas opções do carrinho ("0,54"). */
const cm = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");

export function toOrderProduct(line: PricedLine, facts: ProductFacts = NO_FACTS): OrderProduct {
  const variations = Object.fromEntries(Object.entries(line.variation.v).map(([key, value]) => [optionLabel(key), value]));
  const job = itemJobName(line.input);
  const box = facts.packaging;
  const w2p = artePeloWebToPrint(line, facts);
  return {
    id: line.variation.id,
    groupId: line.groupId,
    groupCategoryId: facts.categoryId,
    productName: line.name,
    productImage: facts.image,
    productType: 0,
    quantidade: line.lots,
    price: line.unitPrice,
    precoTotal: round2(line.productTotal),
    variations,
    descricao: clip(line.input.options["Observação"] ?? "", 500),
    nomeTrabalho: job,
    nome_trabalho: job,
    desc_trabalho: workDescription(line, new Set(Object.keys(variations)), w2p),
    tipoProducao: line.express ? "expresso" : "economico",
    productionTime: line.leadDays,
    package: box ? { peso: box[0], altura: box[2], largura: box[1], comprimento: box[3] } : null,
    arte: {
      tipo: line.criacao > 0 ? ARTE_CRIACAO : ARTE_DO_CLIENTE,
      preco: round2(line.criacao),
      web2print: w2p ? "SIM" : "NAO",
      anexos: orderAttachments(line.input.files ?? [], facts.attachments, { semArquivo: facts.semArquivo }),
    },
    tratamentoArquivo: { tipo: "Padrão", preco: 0 },
    precoTotalAcabamentos: line.acabamentos.total,
  };
}

type PayloadInput = {
  customerId: number;
  lines: PricedLine[];
  method: PaymentMethod;
  delivery: OrderDelivery;
  /** Foto, categoria, embalagem e tipos de anexo de cada item (catálogo). */
  facts?: (line: PricedLine) => ProductFacts | null;
  /** Créditos da conta usados na compra (divisaoDoPagamento, já limitado ao saldo); o resto vai em `method`. */
  credito?: number;
  /** Dias que não contam no prazo (GET /feriados); sem a lista, os feriados nacionais. */
  holidays?: ReadonlySet<string>;
  now?: Date;
};

/** Pagamento como no exemplo; `pago` = a parte em créditos, que vai em credito_usado. */
function pagamentoDoPedido(total: number, pago: number, tipo: string): { pagamento: OrderPayment; credito_usado?: number } {
  const restante = round2(total - pago);
  if (pago > 0 && restante === 0) return { pagamento: { tipo: PAGAMENTO_CREDITO.apiType, valor: pago, status: 0 }, credito_usado: pago };
  return { pagamento: { tipo, valor: restante, status: 0 }, ...(pago > 0 ? { credito_usado: pago } : {}) };
}

export function buildOrderPayload({ customerId, lines, method, delivery, facts, credito = 0, holidays, now = new Date() }: PayloadInput): OrderPayload {
  const total = round2(orderTotal(lines) + round2(delivery.frete ?? 0));
  const pago = round2(Math.min(total, Math.max(0, credito)));
  const clock = brasiliaClock(now);
  return {
    data: clock.data,
    hora: clock.hora,
    entrega: entregaDoPedido(delivery),
    previsao: orderForecast(clock, lines.map((line) => line.leadDays), holidays),
    produtos: lines.map((line) => toOrderProduct(line, facts?.(line) ?? NO_FACTS)),
    idCliente: customerId,
    ...pagamentoDoPedido(total, pago, PAYMENT_METHODS[method].apiType),
  };
}

const ENVELOPE_DO_EXEMPLO = ["data", "hora", "entrega", "previsao", "produtos", "idCliente", "pagamento"] as const;
const PRODUTO_FORA_DO_EXEMPLO = ["unidades", "largura", "altura", "area", "kit"];

/**
 * Entrega guardada na fila em qualquer formato anterior → {id, taxaEntrega}: a do site ({tipo, endereco, rota |
 * transportadora, frete}, até 03/11/2026) e a retirada {id: "J" | null, nome} (de 03 a 05/11/2026). Já no formato de
 * hoje, passa igual.
 */
function entregaGuardada(entrega: Record<string, unknown>): EntregaDoPedido {
  if (typeof entrega.tipo === "string") return entregaDoPedido(entrega as OrderDelivery);
  if (typeof entrega.id === "string" && typeof entrega.taxaEntrega === "number") return entrega as EntregaDoPedido;
  const loja = lojaDoCodigo(entrega.id) ?? LOJAS_RETIRADA.find((l) => l.nome === entrega.nome);
  return entregaDoPedido({ tipo: "Retirada", endereco: null, ...(loja ? { loja: { id: loja.id, nome: loja.nome } } : {}) });
}

/**
 * Pedido guardado na fila antes do alinhamento ao exemplo (03/11/2026): sai no formato de hoje. Tira tipo_compra, envio,
 * nome_trabalho, precoTotal e frete do envelope (o frete vai na taxaEntrega), os extras dos produtos e
 * forma/parcelas/credito do pagamento; a entrega vira {id, taxaEntrega} (entregaGuardada). O pedido já no formato novo
 * passa igual.
 */
export function noFormatoDoExemplo(guardado: OrderPayload | Record<string, unknown>): OrderPayload {
  const antigo = guardado as Record<string, unknown> & { entrega?: unknown; produtos?: unknown[]; pagamento?: Record<string, unknown> };
  const envelope = Object.fromEntries(ENVELOPE_DO_EXEMPLO.filter((campo) => campo in antigo).map((campo) => [campo, antigo[campo]])) as OrderPayload;
  if (isRecord(antigo.entrega)) envelope.entrega = entregaGuardada(antigo.entrega);
  envelope.produtos = (antigo.produtos ?? []).map((produto) => Object.fromEntries(Object.entries(produto as Record<string, unknown>).filter(([campo]) => !PRODUTO_FORA_DO_EXEMPLO.includes(campo)))) as OrderProduct[];
  const pagamento = antigo.pagamento ?? {};
  const credito = Number(antigo.credito_usado ?? pagamento.credito ?? 0);
  const tipo = String(pagamento.tipo ?? "");
  // Antes, o pago todo em crédito ia com valor 0 e o crédito à parte: agora o valor é o dos créditos.
  const valor = tipo === PAGAMENTO_CREDITO.apiType && credito > 0 ? credito : Number(pagamento.valor ?? 0);
  envelope.pagamento = { tipo, valor, status: Number(pagamento.status ?? 0) };
  if (credito > 0) envelope.credito_usado = round2(credito);
  return envelope;
}

// ---------------------------------------------------------------------------------- entrada do checkout

/** `usarCredito`: o cliente quer pagar com os créditos da conta (o servidor calcula quanto: creditos.ts). */
export type OrderRequest = { items: OrderItemInput[]; payment: PaymentMethod; delivery: DeliveryChoice; expectedTotal: number; usarCredito?: boolean };

/** Pastas públicas aceitas nos arquivos da arte: a do Bunny e, quando ele falha, a do próprio site (fila-pedidos). */
export type ArtBases = string | readonly string[];

export const MAX_ORDER_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 100_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string | null => (typeof value === "string" ? value.trim().slice(0, max) : null);

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n < 1e9 ? n : undefined;
}

/** Medida em cm: ausente → undefined; inválida → null. */
function measure(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : null;
}

/**
 * Um item do carrinho vindo do navegador (validado campo a campo); null = inválido. `artBase`: pasta pública do
 * Bunny ("https://…b-cdn.net/uploads-clientes/") e, quando o Bunny falha, a pasta dos arquivos guardados no próprio site
 * (src/lib/fila-pedidos); só arquivos delas entram no pedido.
 */
export function parseItem(raw: unknown, artBase: ArtBases = ""): OrderItemInput | null {
  if (!isRecord(raw)) return null;
  const key = text(raw.key, 64);
  const name = text(raw.name, 200);
  const quantity = Number(raw.quantity);
  const unitPrice = Number(raw.unitPrice);
  const widthCm = measure(raw.widthCm);
  const heightCm = measure(raw.heightCm);
  // Lotes, peças (m²) ou unidades (vestuário em grade pode passar de mil peças).
  if (!key || !name || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) return null;
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || widthCm === null || heightCm === null) return null;

  const options: Record<string, string> = {};
  if (isRecord(raw.options)) {
    for (const [label, value] of Object.entries(raw.options).slice(0, 40)) {
      if (typeof value === "string" && label.trim()) options[label.trim().slice(0, 80)] = value.trim().slice(0, 300);
    }
  }
  const bundleId = isRecord(raw.bundle) ? text(raw.bundle.id, 64) : null;
  const bundleName = isRecord(raw.bundle) ? text(raw.bundle.name, 120) : null;
  const previa = parseUploadedPreview(raw.previa, artBase);
  return {
    key,
    slug: text(raw.slug, 200) ?? "",
    name,
    groupId: positiveInt(raw.groupId),
    variationId: positiveInt(raw.variationId),
    quantity,
    ...(widthCm !== undefined ? { widthCm } : {}),
    ...(heightCm !== undefined ? { heightCm } : {}),
    express: raw.express === true,
    options,
    artName: text(raw.artName, 200) || null,
    bundle: bundleId && bundleName ? { id: bundleId, name: bundleName } : null,
    unitPrice,
    files: parseUploadedFiles(raw.files, artBase),
    ...(previa ? { previa } : {}),
    acabamentos: parseAcabamentosEscolhidos(raw.acabamentos),
    termosArte: aceiteValido(raw.termosArte),
    ...(raw.criacaoArte === true ? { criacaoArte: true } : {}),
  };
}

function parseAddress(raw: unknown): DeliveryAddress | null {
  if (!isRecord(raw)) return null;
  const address: DeliveryAddress = {
    cep: onlyDigits(text(raw.cep, 9) ?? ""),
    logradouro: text(raw.logradouro, 120) ?? "",
    numero: text(raw.numero, 20) ?? "",
    complemento: text(raw.complemento, 80) ?? "",
    bairro: text(raw.bairro, 80) ?? "",
    cidade: text(raw.cidade, 80) ?? "",
    estado: (text(raw.estado, 2) ?? "").toUpperCase(),
  };
  return addressProblem(address) ? null : address;
}

function parseDelivery(raw: unknown): DeliveryChoice | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "rota" || raw.kind === "cadastro") return { kind: raw.kind };
  if (raw.kind === "retirada") {
    const loja = raw.loja === undefined ? LOJA_PADRAO : positiveInt(raw.loja);
    return lojaRetirada(loja) ? { kind: "retirada", loja } : null;
  }
  if (raw.kind === "transportadora") {
    const address = raw.address === null || raw.address === undefined ? null : parseAddress(raw.address);
    if (raw.address && !address) return null;
    const servico = raw.servico === null || raw.servico === undefined ? null : positiveInt(raw.servico);
    if (servico === undefined) return null;
    return { kind: "transportadora", address, servico };
  }
  if (raw.kind !== "outro") return null;
  const address = parseAddress(raw.address);
  return address ? { kind: "outro", address } : null;
}

export function parseOrderRequest(raw: unknown, { artBase = "" }: { artBase?: ArtBases } = {}): { ok: true; value: OrderRequest } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Pedido inválido." };
  if (!Array.isArray(raw.items) || raw.items.length === 0) return { ok: false, error: "Seu carrinho está vazio." };
  if (raw.items.length > MAX_ORDER_ITEMS) return { ok: false, error: `O pedido pode ter até ${MAX_ORDER_ITEMS} itens.` };
  const termos = aceiteValido(raw.termosArte);
  const items = raw.items.map((item) => {
    const parsed = parseItem(item, artBase);
    return parsed && termos && !parsed.termosArte && levaArte(parsed) ? { ...parsed, termosArte: termos } : parsed;
  });
  if (items.some((item) => item === null)) return { ok: false, error: "Há um item inválido no carrinho. Remova e adicione de novo." };
  if (new Set(items.map((item) => item!.key)).size !== items.length) return { ok: false, error: "Há itens repetidos no carrinho." };
  const payment = raw.payment;
  if (!isPaymentMethod(payment)) return { ok: false, error: "Escolha a forma de pagamento." };
  const delivery = parseDelivery(raw.delivery);
  if (!delivery) return { ok: false, error: "Confira o endereço de entrega." };
  const expectedTotal = Number(raw.expectedTotal);
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0) return { ok: false, error: "Total do pedido inválido." };
  return { ok: true, value: { items: items as OrderItemInput[], payment, delivery, expectedTotal, ...(raw.usarCredito === true ? { usarCredito: true } : {}) } };
}

// ---------------------------------------------------------------------------------- resposta da API

const ORDER_KEYS = ["compra", "order", "idcompra", "id_compra", "numero_compra", "pedido", "idpedido", "id_pedido", "numero", "id"];

function asOrderNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d{1,12}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Número da compra na resposta do POST /gerarpedido (formato não documentado: procura chaves comuns). */
export function extractOrderNumber(result: unknown, depth = 0): number | null {
  if (Array.isArray(result)) return result.length && depth < 2 ? extractOrderNumber(result[0], depth + 1) : null;
  if (!isRecord(result)) return asOrderNumber(result);
  const entries = Object.entries(result).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const wanted of ORDER_KEYS) {
    const found = entries.find(([key]) => key === wanted);
    const number = found ? asOrderNumber(found[1]) : null;
    if (number) return number;
  }
  if (depth >= 2) return null;
  for (const [, value] of entries) {
    if (typeof value === "object" && value !== null) {
      const number = extractOrderNumber(value, depth + 1);
      if (number) return number;
    }
  }
  return null;
}
