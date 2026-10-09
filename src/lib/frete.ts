/*
 * Frete pela API de frete da Padrão Color (puro e testado). A Padrão já cota no Melhor Envio com a conta, o CEP de
 * despacho e as regras dela; o site só manda o CEP de destino e as caixas (POST {to, products}, frete-api.ts) e mostra
 * as formas de entrega que voltam.
 *
 * As caixas saem da embalagem cadastrada na Padrão para cada produto (GET /produtos → embalagem), que fica no
 * catálogo: [peso kg, largura, altura, comprimento cm, lotes por caixa]. `quantity` = volumes: um lote de 1.000 cartões
 * num volume = 1.
 */

export type Embalagem = [peso: number, largura: number, altura: number, comprimento: number, lotesPorCaixa: number];

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Embalagem da variação vendida. Sem ela, a mais pesada entre as variações do mesmo produto (para não cobrar frete a
 * menos); `estimada` avisa que não é a medida exata da variação. Null = o produto não tem nenhuma medida cadastrada.
 */
export function embalagemDe(variations: { id?: number; em?: Embalagem }[], variationId: number | null): { embalagem: Embalagem; estimada: boolean } | null {
  const own = variations.find((v) => v.id === variationId)?.em;
  if (own) return { embalagem: own, estimada: false };
  const heaviest = variations
    .map((v) => v.em)
    .filter((em): em is Embalagem => Boolean(em))
    .sort((a, b) => b[0] - a[0] || b[1] * b[2] * b[3] - a[1] * a[2] * a[3])[0];
  return heaviest ? { embalagem: heaviest, estimada: true } : null;
}

/** Produto na cotação (products da API de frete): id da variação, medidas inteiras em cm, peso em kg e volumes. */
export type PacoteFrete = { id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number };

/** Caixas do pedido: cada item vira ⌈lotes ÷ lotes por caixa⌉ volumes da embalagem dele (sem valor declarado). */
export function pacotesDoPedido(itens: { id: string; lotes: number; embalagem: Embalagem }[]): PacoteFrete[] {
  return itens.map(({ id, lotes, embalagem: [peso, largura, altura, comprimento, porCaixa] }) => ({
    id,
    width: Math.max(1, Math.ceil(largura)),
    height: Math.max(1, Math.ceil(altura)),
    length: Math.max(1, Math.ceil(comprimento)),
    weight: Math.round(peso * 1000) / 1000,
    insurance_value: 0,
    quantity: Math.max(1, Math.ceil(lotes / Math.max(1, porCaixa))),
  }));
}

/** Uma forma de entrega da cotação (preço e prazo de transporte, depois que o pedido fica pronto). */
export type OpcaoFrete = { id: number; empresa: string; nome: string; preco: number; prazo: number; prazoMin: number; prazoMax: number };

const numero = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN);

/**
 * Lê a resposta da API de frete da Padrão ({environment, services[], unavailable[]}: price, deliveryTime,
 * deliveryRange) e também o formato do Melhor Envio (lista com custom_price, delivery_time…). Ignora serviço com erro ou
 * sem preço; mais barata primeiro.
 */
export function opcoesDeFrete(raw: unknown): OpcaoFrete[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { services?: unknown }).services) ? (raw as { services: unknown[] }).services : [];
  const out: OpcaoFrete[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const id = numero(s.id);
    const preco = numero(s.custom_price ?? s.price);
    if (s.error || !Number.isInteger(id) || !(preco > 0)) continue;
    const range = (s.deliveryRange ?? s.custom_delivery_range ?? s.delivery_range) as { min?: unknown; max?: unknown } | undefined;
    const prazo = numero(s.deliveryTime ?? s.custom_delivery_time ?? s.delivery_time);
    const company = s.company as { name?: unknown } | undefined;
    out.push({
      id,
      empresa: typeof company?.name === "string" ? company.name : "",
      nome: typeof s.name === "string" ? s.name : `Serviço ${id}`,
      preco: roundCents(preco),
      prazo: Number.isFinite(prazo) ? prazo : 0,
      prazoMin: Number.isFinite(numero(range?.min)) ? numero(range?.min) : Number.isFinite(prazo) ? prazo : 0,
      prazoMax: Number.isFinite(numero(range?.max)) ? numero(range?.max) : Number.isFinite(prazo) ? prazo : 0,
    });
  }
  return out.sort((a, b) => a.preco - b.preco || a.prazo - b.prazo);
}

/** "Correios SEDEX", "Loggi Ponto" (sem repetir a empresa quando o nome já a traz). */
export function nomeFrete(o: Pick<OpcaoFrete, "empresa" | "nome">): string {
  return o.empresa && !o.nome.toLowerCase().includes(o.empresa.toLowerCase()) ? `${o.empresa} ${o.nome}` : o.nome;
}

/** "3 a 5 dias úteis" / "2 dias úteis" (prazo de transporte, depois da produção). */
export function prazoFrete(o: Pick<OpcaoFrete, "prazoMin" | "prazoMax">, extra = 0): string {
  const min = o.prazoMin + extra;
  const max = Math.max(o.prazoMax, o.prazoMin) + extra;
  return min === max ? `${max} ${max === 1 ? "dia útil" : "dias úteis"}` : `${min} a ${max} dias úteis`;
}
