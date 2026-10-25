import type { ApiEndereco } from "./api/types";
import type { CustomSize, Variation } from "./catalog";
import { orderAttachments, parseUploadedFiles, type ArtAttachment, type UploadedArtFile } from "./art-files.ts";
import { cotarAcabamentos, parseAcabamentosEscolhidos, resumoAcabamentos, type Acabamento, type AcabamentoEscolhido, type CotacaoAcabamentos } from "./acabamentos.ts";
import { areaQuote, areaRules, cleanOptionLabel } from "./pricing.ts";
import { isValidCep, isValidUf, onlyDigits } from "./api/validation.ts";
import { aceiteValido, levaArte, textoDoAceite, type AceiteTermos } from "./termos-arte.ts";

/*
 * Pedido do site para a API (POST /gerarpedido) — mapeamento explícito, tipado e isolado.
 *
 * O PDF só mostra o envelope {idCliente, produtos, pagamento, tipo_compra, nome_trabalho, precoTotal} e remete a um
 * "contrato de pedido fornecido para a integração". Os produtos seguem o exemplo de pedido que a Padrão mandou
 * (pedido do site atual): id (variação), groupId, groupCategoryId, productName, productImage, productType,
 * quantidade (lotes), price (um lote), precoTotal, variations (as opções da variação, com o rótulo limpo), package
 * (embalagem da variação), tipoProducao ("expresso"/"economico"), productionTime (dias úteis), nomeTrabalho,
 * nome_trabalho, descricao, desc_trabalho, arte {tipo, preco, anexos[{url, nome, tipoArquivo}]}, tratamentoArquivo
 * e precoTotalAcabamentos. No envelope: data e hora (Brasília), previsao (o maior prazo em dias úteis, sem fim de
 * semana nem feriado nacional), idCliente, pagamento {tipo, valor, status} e entrega.
 * Premissas a confirmar com a Padrão (trocar aqui):
 * - arte.tipo = 1 com a arte do cliente (o exemplo traz 1 com anexo); sem arquivo, vai com anexos vazio (cliente manda
 *   depois). Criação de arte pela equipe (preço da variação, `criacao_arte`): arte.tipo = 2 e arte.preco = o preço dela,
 *   somado ao total do item e do pedido; o pedido do cliente vai em desc_trabalho e as referências em anexos.
 * - "Nome da arte" vira o nome do trabalho do item e "Observação" vai em descricao.
 * - anexos: os arquivos do Bunny (art-files.ts), com o tipo de anexo que a variação aceita (customizacao.ts); a
 *   variação sem personalização ou de neon pronto vai sem anexos.
 * - tipoProducao "economico" no prazo normal (o exemplo só mostra "expresso"); productType 0; tratamentoArquivo
 *   "Padrão" (o site não vende esse serviço).
 * - Acabamentos extras (acabamentos.ts): o valor vai em precoTotalAcabamentos e a lista em desc_trabalho
 *   ("Acabamentos: Serrilha (2×)…"); precoTotal do item = price × quantidade (só o produto) e o precoTotal do
 *   envelope soma os dois. O prazo dos acabamentos entra em productionTime e na previsão.
 * - entrega: o exemplo traz a loja de retirada ({id, nome}); o site manda {tipo, endereco} até a lista de lojas e o
 *   formato da entrega com endereço chegarem.
 * - Extras do site que o exemplo não tem: unidades (lotes × unidades do lote), largura/altura/area (m²) e kit.
 * - Medida livre (m²): quantidade = peças, price = total ÷ peças e precoTotal = total do item, porque o mínimo de 1 m²
 *   vale no item inteiro (revisão da Padrão de 25/10/2026); `area` é a área cobrada de uma peça.
 * - pagamento.status 0 = aguardando; forma e parcelas vão junto.
 * - tipo_compra = "Site"; nome_trabalho = texto da arte do primeiro item (ou o nome) + "+ N itens"; precoTotal =
 *   soma dos itens no preço do cliente (balcão ou revenda). Sem desconto no PIX (revisão da Padrão de 25/10/2026).
 * O servidor recalcula tudo a partir da variação: o preço que vem do navegador só serve para comparar.
 */

export type PaymentMethod = "pix" | "cartao" | "boleto";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; hint: string; apiType: string }> = {
  pix: { label: "Pix", hint: "Pagamento instantâneo", apiType: "PIX" },
  cartao: { label: "Cartão de crédito", hint: "Pagamento com cartão de crédito", apiType: "Cartão de Crédito" },
  boleto: { label: "Boleto bancário", hint: "Pagamento bancário", apiType: "Boleto Bancário" },
};

export const PURCHASE_TYPE = "Site";

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

/** Nome do trabalho da compra: o kit/festa quando tudo vem de um só; senão o primeiro item + "+ N itens". */
export function orderJobName(lines: { input: Pick<OrderItemInput, "name" | "options" | "bundle"> }[]): string {
  if (lines.length === 0) return "";
  const first = lines[0].input;
  if (first.bundle && lines.every((line) => line.input.bundle?.id === first.bundle?.id)) return clip(bundleTitle(first.bundle, first.options), 60);
  const rest = lines.length - 1;
  const suffix = rest > 0 ? ` + ${rest} ${rest === 1 ? "item" : "itens"}` : "";
  return clip(itemJobName(lines[0].input), 60 - suffix.length) + suffix;
}

// ---------------------------------------------------------------------------------- entrega

export type DeliveryAddress = { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string };

export type DeliveryChoice = { kind: "cadastro" } | { kind: "retirada" } | { kind: "outro"; address: DeliveryAddress };

export type OrderDelivery = { tipo: "Entrega" | "Retirada"; endereco: DeliveryAddress | null };

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

/** Entrega do pedido: endereço do cadastro (GET /cliente), outro endereço ou retirada. */
export function orderDelivery(choice: DeliveryChoice, registered: DeliveryAddress | null): OrderDelivery | null {
  if (choice.kind === "retirada") return { tipo: "Retirada", endereco: null };
  if (choice.kind === "outro") return { tipo: "Entrega", endereco: choice.address };
  return registered && !addressProblem(registered) ? { tipo: "Entrega", endereco: registered } : null;
}

// ---------------------------------------------------------------------------------- datas

/** Data e hora de Brasília: o pedido leva data "DD/MM/AAAA" e hora "HH:MM:SS". */
export function brasiliaClock(now: Date): { iso: string; data: string; hora: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, data: `${parts.day}/${parts.month}/${parts.year}`, hora: `${hour}:${parts.minute}:${parts.second}` };
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
function easter(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/** Feriados nacionais (AAAA-MM-DD): os fixos e a Sexta-feira Santa. */
export function nationalHolidays(year: number): string[] {
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((day) => `${year}-${day}`);
  return [...fixed, isoDay(easter(year) - 2 * 86_400_000)];
}

/** AAAA-MM-DD + `days` dias úteis (sem sábado, domingo nem feriado). */
export function addBusinessDays(iso: string, days: number, holidays: ReadonlySet<string>): string {
  const [y, m, d] = iso.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    t += 86_400_000;
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(isoDay(t))) left -= 1;
  }
  return isoDay(t);
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Previsão do pedido: o maior prazo de produção dos itens, em dias úteis a partir de hoje (Brasília). */
export function orderForecast(today: string, leadDays: (number | null)[]): string | null {
  const days = leadDays.filter((value): value is number => typeof value === "number" && value > 0);
  if (!days.length) return null;
  const year = Number(today.slice(0, 4));
  const holidays = new Set([...nationalHolidays(year), ...nationalHolidays(year + 1)]);
  return brDate(addBusinessDays(today, Math.max(...days), holidays));
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

export type OrderArt = { tipo: number; preco: number; anexos: ArtAttachment[] };

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
  /** Unidades (lotes × unidades do lote). */
  unidades: number;
  /** Medida livre, em cm, e área cobrada em m². */
  largura?: number;
  altura?: number;
  area?: number;
  /** Kit/festa que trouxe o item: id do site e título ("Crie Sua Festa — Aniversário"). */
  kit: { id: string; nome: string } | null;
};

export type OrderPayment = { tipo: string; valor: number; status: number; forma: PaymentMethod; parcelas: number };

export type OrderPayload = {
  data: string;
  hora: string;
  previsao: string | null;
  idCliente: number;
  produtos: OrderProduct[];
  pagamento: OrderPayment;
  entrega: OrderDelivery;
  tipo_compra: string;
  nome_trabalho: string;
  precoTotal: number;
};

const NO_FACTS: ProductFacts = { image: "", categoryId: null, packaging: null, attachments: [] };

/** arte.tipo do pedido: a arte do cliente (como no exemplo da Padrão) ou a criação pela equipe (a confirmar). */
export const ARTE_DO_CLIENTE = 1;
export const ARTE_CRIACAO = 2;

/** Rótulo limpo da opção ("02 - Formato:" → "Formato"). */
const optionLabel = (key: string) => cleanOptionLabel(key).replace(/:$/, "").trim();

/** O que o item leva além das opções da variação: a linha da arte e as opções do site (texto, kit, tamanhos…). */
function workDescription(line: PricedLine, variationLabels: Set<string>): string {
  const art = line.input.artName ? `Arte: ${line.input.artName}` : "Arte: enviar depois";
  // Os acabamentos vêm da cotação do servidor (a linha "Acabamentos" do carrinho é só exibição).
  // A observação vai em descricao (não repete aqui).
  const extras = Object.entries(line.input.options)
    .filter(([key]) => !variationLabels.has(optionLabel(key)) && optionLabel(key) !== "Acabamentos" && optionLabel(key) !== "Observação")
    .map(([key, value]) => `${key}: ${value}`);
  const finishing = line.acabamentos.itens.length ? [`Acabamentos: ${resumoAcabamentos(line.acabamentos.itens)}`] : [];
  const termos = line.input.termosArte ? [`Termos de envio de arte: ${textoDoAceite(line.input.termosArte)}`] : [];
  return clip([art, ...extras, ...finishing, ...termos].join(" · "), 1000);
}

export function toOrderProduct(line: PricedLine, facts: ProductFacts = NO_FACTS): OrderProduct {
  const variations = Object.fromEntries(Object.entries(line.variation.v).map(([key, value]) => [optionLabel(key), value]));
  const job = itemJobName(line.input);
  const box = facts.packaging;
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
    desc_trabalho: workDescription(line, new Set(Object.keys(variations))),
    tipoProducao: line.express ? "expresso" : "economico",
    productionTime: line.leadDays,
    package: box ? { peso: box[0], altura: box[2], largura: box[1], comprimento: box[3] } : null,
    arte: {
      tipo: line.criacao > 0 ? ARTE_CRIACAO : ARTE_DO_CLIENTE,
      preco: round2(line.criacao),
      anexos: orderAttachments(line.input.files ?? [], facts.attachments, { semArquivo: facts.semArquivo }),
    },
    tratamentoArquivo: { tipo: "Padrão", preco: 0 },
    precoTotalAcabamentos: line.acabamentos.total,
    unidades: line.units,
    ...(line.size ? { largura: line.size.widthCm, altura: line.size.heightCm, area: line.size.billedAreaM2 } : {}),
    kit: line.input.bundle ? { id: line.input.bundle.id, nome: bundleTitle(line.input.bundle, line.input.options) } : null,
  };
}

type PayloadInput = {
  customerId: number;
  lines: PricedLine[];
  method: PaymentMethod;
  delivery: OrderDelivery;
  /** Foto, categoria, embalagem e tipos de anexo de cada item (catálogo). */
  facts?: (line: PricedLine) => ProductFacts | null;
  now?: Date;
};

export function buildOrderPayload({ customerId, lines, method, delivery, facts, now = new Date() }: PayloadInput): OrderPayload {
  const total = orderTotal(lines);
  const clock = brasiliaClock(now);
  return {
    data: clock.data,
    hora: clock.hora,
    previsao: orderForecast(clock.iso, lines.map((line) => line.leadDays)),
    idCliente: customerId,
    produtos: lines.map((line) => toOrderProduct(line, facts?.(line) ?? NO_FACTS)),
    pagamento: { tipo: PAYMENT_METHODS[method].apiType, valor: total, status: 0, forma: method, parcelas: 1 },
    entrega: delivery,
    tipo_compra: PURCHASE_TYPE,
    nome_trabalho: orderJobName(lines),
    precoTotal: total,
  };
}

// ---------------------------------------------------------------------------------- entrada do checkout

export type OrderRequest = { items: OrderItemInput[]; payment: PaymentMethod; delivery: DeliveryChoice; expectedTotal: number };

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
    acabamentos: parseAcabamentosEscolhidos(raw.acabamentos),
    termosArte: aceiteValido(raw.termosArte),
    ...(raw.criacaoArte === true ? { criacaoArte: true } : {}),
  };
}

function parseDelivery(raw: unknown): DeliveryChoice | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "cadastro" || raw.kind === "retirada") return { kind: raw.kind };
  if (raw.kind !== "outro" || !isRecord(raw.address)) return null;
  const a = raw.address;
  const address: DeliveryAddress = {
    cep: onlyDigits(text(a.cep, 9) ?? ""),
    logradouro: text(a.logradouro, 120) ?? "",
    numero: text(a.numero, 20) ?? "",
    complemento: text(a.complemento, 80) ?? "",
    bairro: text(a.bairro, 80) ?? "",
    cidade: text(a.cidade, 80) ?? "",
    estado: (text(a.estado, 2) ?? "").toUpperCase(),
  };
  return addressProblem(address) ? null : { kind: "outro", address };
}

/**
 * Valida o corpo do POST /api/pedidos (nada do navegador é confiável). `artBase`: ver parseItem. `termosArte` no corpo
 * é o aceite dado no checkout: vale para os itens personalizados que chegaram sem o aceite da página do produto.
 */
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
  if (payment !== "pix" && payment !== "cartao" && payment !== "boleto") return { ok: false, error: "Escolha a forma de pagamento." };
  const delivery = parseDelivery(raw.delivery);
  if (!delivery) return { ok: false, error: "Confira o endereço de entrega." };
  const expectedTotal = Number(raw.expectedTotal);
  if (!Number.isFinite(expectedTotal) || expectedTotal < 0) return { ok: false, error: "Total do pedido inválido." };
  return { ok: true, value: { items: items as OrderItemInput[], payment, delivery, expectedTotal } };
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
