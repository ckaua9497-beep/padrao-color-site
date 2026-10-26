import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import type { ApiEndereco, ApiPedido, ApiPedidoItem, ApiSituacao } from "@/lib/api/types";
import { arquivosRecebidos, casarItens, estadoDaArte, type ArquivoArte, type ArtesDoItem, type EstadoArte, type Reenvio } from "@/lib/artes-enviadas/regras";
import { formatCep } from "@/lib/api/validation";
import { estornoDe, itemCancelado, textoDoEstorno, type JanelaDeCancelamento } from "@/lib/cancelamento";
import { previsaoAposReenvio, type Relogio } from "@/lib/dias-uteis";
import { formatBRL } from "@/lib/format";
import { formatDateTime } from "@/lib/multiloja/core";
import { OrderActions, PurchaseCancel, type CancelWindow } from "./OrderActions";

/*
 * Pedidos do GET /pedidos. Uma COMPRA (compra, pagamento, nota fiscal, totais) tem vários PEDIDOS (itens:
 * produto, situação, previsão, entrega, valores). Reenvio de arte é por pedido; o cancelamento, nos 15 min depois da
 * compra (cancelamento.ts), vale para a compra inteira ou para um item. "Artes enviadas" (src/lib/artes-enviadas): por
 * item, a arte no gabarito, o que o cliente mandou, o que a Padrão recebeu e a situação da arte.
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

const isLink = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

function addressLine(endereco: Partial<ApiEndereco> | undefined): string | null {
  if (!endereco?.logradouro) return null;
  const street = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const city = [endereco.cidade, endereco.estado].filter(Boolean).join("/");
  return [street + (endereco.complemento ? ` – ${endereco.complemento}` : ""), endereco.bairro, city, endereco.cep ? `CEP ${formatCep(endereco.cep)}` : ""].filter(Boolean).join(" · ");
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

const ESTADO_TOM: Record<EstadoArte, Tone> = { aprovada: "dark", analise: "new", recusada: "brand", cancelada: "neutral" };

function FileList({ files, empty }: { files: (ArquivoArte & { em?: string })[]; empty: string }) {
  if (!files.length) return <p className="mt-1 text-muted">{empty}</p>;
  return (
    <ul className="mt-1 space-y-2">
      {files.map((file, index) => (
        <li key={`${file.nome}-${index}`} className="min-w-0">
          {isLink(file.url) ? (
            <a href={file.url} target="_blank" rel="noreferrer" title={file.nome} className="block truncate font-semibold underline underline-offset-2">
              {file.nome}
            </a>
          ) : (
            <span title={file.nome} className="block truncate font-semibold">
              {file.nome}
            </span>
          )}
          {file.tipo || file.em ? <span className="block text-caption text-muted">{[file.tipo, file.em].filter(Boolean).join(" · ")}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Artes enviadas do item: a arte no gabarito, o que o cliente mandou (e reenviou), o que recebemos e a situação. */
function ArtesEnviadas({ item, artes, reenvios }: { item: ApiPedidoItem; artes: ArtesDoItem | null; reenvios: Reenvio[] }) {
  const recebidos = arquivosRecebidos(item);
  const enviados = [...(artes?.enviados ?? []), ...reenvios.map((r) => ({ ...r.arquivo, em: formatDateTime(r.em) }))];
  if (!artes?.gabarito && !enviados.length && !recebidos.length) return null;
  const estado = estadoDaArte(item.situacao);
  return (
    <section aria-label={`Artes enviadas do pedido ${item.pedido}`} className="mt-4 rounded-thumb border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[15px] font-bold">Artes enviadas</h4>
        <Badge tone={ESTADO_TOM[estado.estado]}>{estado.texto}</Badge>
      </div>
      <div className="mt-3 grid gap-4 text-sm md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-caption text-muted">No gabarito</p>
          {artes?.gabarito ? (
            <a href={artes.gabarito.url} target="_blank" rel="noreferrer" className="mt-1 block overflow-hidden rounded-thumb border border-line bg-mist" title="Abrir a arte no gabarito">
              <Image src={artes.gabarito.url} alt={`Arte de “${artes.nome}” no gabarito`} width={400} height={300} unoptimized className="h-auto w-full" />
            </a>
          ) : (
            <p className="mt-1 text-muted">Sem a imagem do gabarito neste pedido.</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-caption text-muted">Você enviou</p>
          <FileList files={enviados} empty="Nenhum arquivo registrado pelo site." />
        </div>
        <div className="min-w-0">
          <p className="text-caption text-muted">Recebemos</p>
          <FileList files={recebidos} empty="A pré-impressão ainda não registrou os arquivos." />
        </div>
      </div>
    </section>
  );
}

/** Relógio de Brasília e feriados da hora da página: a previsão que o reenvio de arte daria agora. */
type ResendClock = { clock: Relogio; holidays: ReadonlySet<string> };

function OrderItem({ item, cancel, resendClock, artes, reenvios }: { item: ApiPedidoItem; cancel: CancelWindow | null; resendClock: ResendClock; artes: ArtesDoItem | null; reenvios: Reenvio[] }) {
  const situacao = item.situacao;
  const address = addressLine(item.entrega_retirada?.endereco);
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
              <span className="font-semibold">
                {item.entrega_retirada.tipo}
                {item.entrega_retirada.rota?.trim() ? ` · ${item.entrega_retirada.rota.trim()}` : ""}
              </span>
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

      <ArtesEnviadas item={item} artes={artes} reenvios={reenvios} />

      <OrderActions
        order={item.pedido}
        jobName={name}
        resend={situacao?.reenvia_arte === "Sim" && { previsao: item.previsao ?? "", novaPrevisao: previsaoAposReenvio(item.previsao, resendClock.clock, resendClock.holidays) }}
        cancel={cancel}
        tratamento={!itemCancelado(situacao)}
      />
    </li>
  );
}

const cancelWindow = (order: ApiPedido, janela: JanelaDeCancelamento, items: number[]): CancelWindow | null =>
  janela.aberta && janela.ate !== null ? { until: janela.ate, untilTime: janela.ateHora, refund: textoDoEstorno(estornoDe(order, items)) } : null;

/** O que o site guardou da compra (artes-enviadas/repo.ts): os itens dela e os reenvios por pedido. */
export type ArtesDaCompra = { itens: ArtesDoItem[]; reenvios: ReadonlyMap<string, Reenvio[]> };

/** `janela` = prazo de cancelamento na hora da página (janelaDeCancelamento). */
export function OrderCard({ order, janela, resendClock, artes }: { order: ApiPedido; janela: JanelaDeCancelamento; resendClock: ResendClock; artes: ArtesDaCompra }) {
  const invoice = order.nota_fiscal;
  const itens = order.itens ?? [];
  const casados = casarItens(itens, artes.itens);
  const cancelaveis = itens.filter((item) => janela.itens.includes(item.pedido));
  // Com um item só para cancelar, a faixa da compra basta; com mais, cada item tem o seu botão.
  const porItem = cancelaveis.length > 1;
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
      <PurchaseCancel purchase={order.compra} items={cancelaveis.map((item) => item.nome_trabalho?.trim() || item.produto?.descricao || `Pedido ${item.pedido}`)} cancel={cancelWindow(order, janela, janela.itens)} />
      <ul className="divide-y divide-line">
        {itens.map((item) => (
          <OrderItem
            key={item.pedido}
            item={item}
            cancel={porItem && janela.itens.includes(item.pedido) ? cancelWindow(order, janela, [item.pedido]) : null}
            resendClock={resendClock}
            artes={casados.get(item.pedido) ?? null}
            reenvios={artes.reenvios.get(String(item.pedido)) ?? []}
          />
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
