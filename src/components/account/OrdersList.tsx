import { Badge } from "@/components/ui/Badge";
import type { ApiEndereco, ApiPedido, ApiPedidoItem, ApiSituacao } from "@/lib/api/types";
import { formatCep } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { OrderActions } from "./OrderActions";

/*
 * Pedidos do GET /pedidos. Uma COMPRA (compra, pagamento, nota fiscal, totais) tem vários PEDIDOS (itens:
 * produto, situação, previsão, entrega, valores). Reenvio de arte e cancelamento são por pedido.
 */

type Tone = "dark" | "brand" | "new" | "neutral";

/** Cor do selo da situação pelo texto (os códigos de situação da API não são documentados). */
export function situationTone(situacao: Partial<ApiSituacao> | undefined): Tone {
  const text = `${situacao?.descricao ?? ""} ${situacao?.status ?? ""}`.toLowerCase();
  if (/cancel/.test(text)) return "neutral";
  if (/problema|aten[cç][aã]o|recusad|defeito|pendente de arte/.test(text) || situacao?.reenvia_arte === "Sim") return "brand";
  if (/entregue|conclu|finaliz|retirad/.test(text)) return "dark";
  return "new";
}

/** Situações finais não mostram "Cancelar pedido" (a API recusa de qualquer forma, com o motivo). */
export function canCancel(situacao: Partial<ApiSituacao> | undefined): boolean {
  const text = `${situacao?.descricao ?? ""} ${situacao?.status ?? ""}`.toLowerCase();
  return !/cancel|entregue|conclu|finaliz|retirad|expedid|enviad|despachad|em rota/.test(text);
}

const isLink = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

function addressLine(endereco: Partial<ApiEndereco> | undefined): string | null {
  if (!endereco?.logradouro) return null;
  const street = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const city = [endereco.cidade, endereco.estado].filter(Boolean).join("/");
  return [street + (endereco.complemento ? ` – ${endereco.complemento}` : ""), endereco.bairro, city, endereco.cep ? `CEP ${formatCep(endereco.cep)}` : ""].filter(Boolean).join(" · ");
}

function files(item: ApiPedidoItem): { name: string; url: string | null; kind: string }[] {
  const raw = Array.isArray(item.produto?.arquivos) ? item.produto.arquivos : [];
  return raw
    .filter((file): file is Record<string, unknown> => typeof file === "object" && file !== null)
    .map((file) => ({ name: typeof file.nome === "string" ? file.nome : "arquivo", url: isLink(file.url) ? file.url : null, kind: typeof file.tipo === "string" ? file.tipo : "" }));
}

function Money({ label, value, strong = false }: { label: string; value: number | undefined; strong?: boolean }) {
  if (!value && !strong) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{label}: </span>
      <span className={strong ? "font-bold text-ink" : "text-ink"}>{formatBRL(value ?? 0)}</span>
    </span>
  );
}

function OrderItem({ item }: { item: ApiPedidoItem }) {
  const situacao = item.situacao;
  const address = addressLine(item.entrega_retirada?.endereco);
  const attachments = files(item);
  const name = item.nome_trabalho?.trim() || item.produto?.descricao || `Pedido ${item.pedido}`;
  return (
    <li className="px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-muted">Pedido {item.pedido}</p>
          <h3 className="text-[17px] font-bold leading-snug">{name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {item.produto?.descricao}
            {item.produto?.quantidade ? ` · ${item.produto.quantidade.toLocaleString("pt-BR")} un.` : ""}
          </p>
        </div>
        {situacao?.descricao && <Badge tone={situationTone(situacao)}>{situacao.descricao}</Badge>}
      </div>

      {(situacao?.status || situacao?.texto) && (
        <div className="mt-3 text-sm">
          {situacao.status && <p className="font-semibold">{situacao.status}</p>}
          {situacao.texto && <p className="mt-0.5 text-muted">{situacao.texto}</p>}
        </div>
      )}
      {situacao?.defeito && <p className="mt-3 rounded-thumb bg-coral-50 p-3 text-sm font-semibold text-coral-700">{situacao.defeito}</p>}

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {item.previsao && (
          <div>
            <dt className="text-caption text-muted">Previsão</dt>
            <dd className="font-semibold">{item.previsao}</dd>
          </div>
        )}
        {item.entrega_retirada?.tipo && (
          <div>
            <dt className="text-caption text-muted">Entrega</dt>
            <dd>
              <span className="font-semibold">{item.entrega_retirada.tipo}</span>
              {address && <span className="block text-muted">{address}</span>}
            </dd>
          </div>
        )}
        {(item.tipo_arte || item.tipo_tratamento) && (
          <div>
            <dt className="text-caption text-muted">Arte</dt>
            <dd>{[item.tipo_arte, item.tipo_tratamento].filter(Boolean).join(" · ")}</dd>
          </div>
        )}
        {item.valor && (
          <div>
            <dt className="text-caption text-muted">Valores</dt>
            <dd className="flex flex-wrap gap-x-3 tabular-nums">
              <Money label="Produto" value={item.valor.produto} />
              <Money label="Criação de arte" value={item.valor.criacao_arte} />
              <Money label="Tratamento" value={item.valor.tratamento_profissional} />
              <Money label="Frete" value={item.valor.frete} />
              <Money label="Total" value={item.valor.total} strong />
            </dd>
          </div>
        )}
      </dl>

      {attachments.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="text-caption text-muted">Arquivos</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${index}`} className="max-w-full truncate rounded-full bg-mist px-3 py-1">
                {file.url ? (
                  <a href={file.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                    {file.name}
                  </a>
                ) : (
                  file.name
                )}
                {file.kind && <span className="text-muted"> · {file.kind}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <OrderActions order={item.pedido} jobName={name} canResendArt={situacao?.reenvia_arte === "Sim"} canCancel={canCancel(situacao)} />
    </li>
  );
}

export function OrderCard({ order }: { order: ApiPedido }) {
  const invoice = order.nota_fiscal;
  return (
    <article className="overflow-hidden rounded-card border border-line-strong bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
        <div>
          <h2 className="text-lg font-bold">Compra nº {order.compra}</h2>
          <p className="text-caption text-muted">
            {order.data}
            {order.hora ? ` às ${order.hora.slice(0, 5)}` : ""}
            {order.envio ? ` · ${order.envio}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black tabular-nums">{formatBRL(order.valor_total ?? 0)}</p>
          {order.pagamento?.tipo && <p className="text-caption text-muted">{order.pagamento.tipo}</p>}
        </div>
      </header>
      <ul className="divide-y divide-line">
        {(order.itens ?? []).map((item) => (
          <OrderItem key={item.pedido} item={item} />
        ))}
      </ul>
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-mist px-5 py-4 text-caption tabular-nums md:px-6">
        <Money label="Frete" value={order.frete} />
        <Money label="Crédito usado" value={order.credito_usado} />
        <Money label="Cupom" value={order.valor_cupom} />
        <Money label="Pago" value={order.valor_pago} />
        {invoice?.numero ? (
          isLink(invoice.link) ? (
            <a href={invoice.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
              Nota fiscal nº {invoice.numero}
            </a>
          ) : (
            <span>Nota fiscal nº {invoice.numero}</span>
          )
        ) : (
          <span className="text-muted">Nota fiscal: emitida após o faturamento</span>
        )}
      </footer>
    </article>
  );
}
