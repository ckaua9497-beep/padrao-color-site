import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountCard } from "@/components/account/AccountShell";
import { AccountNav, LogoutButton } from "@/components/account/AuthPanels";
import { situationTone } from "@/components/account/OrdersList";
import { ContactForm, PasswordForm } from "@/components/account/ProfileForms";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import { getCliente, getContaCorrente, getPedidos } from "@/lib/api/padrao";
import type { ApiEndereco } from "@/lib/api/types";
import { formatCep, formatDocument, formatPhone } from "@/lib/api/validation";
import { formatBRL } from "@/lib/format";
import { describeResellerBenefit, isResellerAccount } from "@/lib/reseller";
import { emailDoCliente, nascimentoDoCliente, rotaDoCliente, saldoDaConta, type RotaDoCliente } from "@/lib/cliente";
import { loginUrl, requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false, follow: false } };

function Address({ endereco }: { endereco: Partial<ApiEndereco> | undefined }) {
  if (!endereco?.logradouro) return <p className="text-sm text-muted">Não informado.</p>;
  return (
    <address className="text-sm not-italic leading-relaxed">
      {endereco.logradouro}, {endereco.numero}
      {endereco.complemento ? ` – ${endereco.complemento}` : ""}
      <br />
      {[endereco.bairro, [endereco.cidade, endereco.estado].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
      <br />
      {endereco.cep ? `CEP ${formatCep(endereco.cep)}` : ""}
    </address>
  );
}

/** Rota de entrega do cadastro (cliente.ts): a rota (o nome é a cor) com a taxa, ou transportadora. */
function Route({ rota }: { rota: RotaDoCliente }) {
  if (rota.tipo === "transportadora")
    return (
      <div className="text-sm">
        <p className="font-semibold">Transportadora</p>
        <p className="mt-0.5 text-caption text-muted">Seu endereço não tem rota de entrega da Padrão Color: a entrega é por transportadora.</p>
      </div>
    );
  return (
    <div className="text-sm">
      <p className="flex items-center gap-2 font-semibold">
        {rota.cor && <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-line-strong" style={{ backgroundColor: rota.cor }} />}
        {rota.nome}
      </p>
      {rota.taxa > 0 ? (
        <p className="mt-0.5">
          Taxa da rota: <strong className="tabular-nums">{formatBRL(rota.taxa)}</strong>
        </p>
      ) : null}
      <p className="mt-0.5 text-caption text-muted">
        {rota.cobradaNoPedido ? "A taxa da rota é cobrada no pedido, como frete." : "Pagamento na retirada liberado: a taxa da rota não é cobrada junto com o pedido."}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="break-words font-semibold">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

export default async function AccountPage() {
  const session = await requireSession("/conta");
  const [cliente, conta, pedidos] = await Promise.allSettled([getCliente(session.token), getContaCorrente(session.token), getPedidos({ pag: 1, reg: 3 }, session.token)]);
  if (cliente.status === "rejected" && cliente.reason instanceof ApiError && cliente.reason.status === 401) redirect(loginUrl("/conta", true));
  const data = cliente.status === "fulfilled" ? cliente.value : null;
  // Saldo do GET /contacorrente; sem ele, o do GET /cliente (conta_corrente.credito).
  const corrente = conta.status === "fulfilled" ? conta.value : null;
  const saldo = saldoDaConta(corrente) ?? saldoDaConta(data?.conta_corrente);
  const balance = saldo === null ? null : { saldo, bloqueado: corrente?.bloqueado ?? data?.conta_corrente?.bloqueado ?? 0 };
  const recent = pedidos.status === "fulfilled" ? (pedidos.value?.pedidos ?? []).slice(0, 3) : null;

  const account = { priceTable: data?.tabela?.nome ?? session.priceTable, category: data?.categoria ?? session.category };
  const reseller = isResellerAccount(account);
  const benefit = describeResellerBenefit(account);
  const firstName = (data?.nome || session.name || "").split(" ")[0];

  return (
    <div className="bg-page-cart">
      <div className="container-site py-10 md:py-14">
        <Breadcrumb items={[{ href: "/", label: "Início" }, { label: "Minha conta" }]} />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-section font-bold">Olá{firstName ? `, ${firstName}` : ""}</h1>
            <p className="mt-2 text-muted">Seus dados, seu saldo e seus pedidos na Padrão Color.</p>
            {data?.id ? (
              <p className="mt-1 text-sm">
                <span className="text-muted">ID do cliente:</span> <strong className="tabular-nums">{data.id}</strong>
              </p>
            ) : null}
          </div>
          <LogoutButton />
        </div>
        <div className="mt-6">
          <AccountNav current="conta" />
        </div>

        {!data ? (
          <div className="mt-8 rounded-card border border-line-strong bg-white p-8 text-center">
            <p className="text-lg font-semibold">Não foi possível carregar seus dados agora.</p>
            <p className="mt-2 text-muted">O sistema da Padrão Color pode estar instável. Tente de novo em instantes.</p>
            <Button href="/conta" variant="dark" size="sm" className="mt-5">
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <AccountCard title="Tipo de conta">
              <div className="flex flex-wrap gap-2">
                <Badge tone={reseller ? "new" : "neutral"}>{reseller ? "Revendedor" : "Cliente"}</Badge>
                {data.categoria && <Badge tone="dark">{data.categoria}</Badge>}
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <Field label="Tabela de preço" value={reseller ? data.tabela?.nome : "Balcão (preço do site)"} />
                {benefit && <p className="text-muted">{benefit}</p>}
              </dl>
              {!reseller && (
                <p className="mt-4 text-caption text-muted">
                  Trabalha com gráfica ou design?{" "}
                  <a href="https://padraocolor.com.br/institucional/nossas-categorias-de-revenda" target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
                    Conheça as categorias de revenda
                  </a>
                  .
                </p>
              )}
            </AccountCard>

            <AccountCard title="Saldo">
              {balance ? (
                <>
                  <p className="text-amount tabular-nums">{formatBRL(balance.saldo ?? 0)}</p>
                  <p className="mt-1 text-caption text-muted">{(balance.saldo ?? 0) < 0 ? "Saldo devedor na conta corrente." : "Crédito disponível na conta corrente."}</p>
                  {balance.bloqueado ? <p className="mt-3 text-sm">Bloqueado: {formatBRL(balance.bloqueado)}</p> : null}
                  <p className="mt-3 text-caption text-muted">O uso do crédito em uma compra é combinado com o atendimento. O crédito usado em uma compra cancelada volta para cá automaticamente.</p>
                </>
              ) : (
                <p className="text-sm text-muted">Saldo indisponível no momento.</p>
              )}
            </AccountCard>

            <AccountCard
              title="Últimos pedidos"
              action={
                <Link href="/conta/pedidos" className="text-sm font-semibold underline underline-offset-4">
                  Ver todos
                </Link>
              }
            >
              {recent === null ? (
                <p className="text-sm text-muted">Não foi possível carregar os pedidos agora.</p>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted">Você ainda não tem pedidos.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((order) => (
                    <li key={order.compra} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-semibold">Compra nº {order.compra}</p>
                        <p className="text-caption text-muted">
                          {order.data} · {formatBRL(order.valor_total ?? 0)}
                        </p>
                      </div>
                      {order.itens?.[0]?.situacao?.descricao && <Badge tone={situationTone(order.itens[0].situacao)}>{order.itens[0].situacao.descricao}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </AccountCard>

            <AccountCard title="Seus dados" className="lg:col-span-2">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Field label="ID do cliente" value={data.id ? String(data.id) : null} />
                <Field label="Nome" value={data.nome} />
                <Field label="Razão social" value={data.razao && data.razao !== data.nome ? data.razao : null} />
                <Field label="CPF/CNPJ" value={data.documento ? formatDocument(data.documento) : null} />
                <Field label="Usuário de acesso" value={data.login} />
                <Field label="E-mail" value={emailDoCliente(data)} />
                <Field label="Telefones" value={[...new Set([data.telefone_1, data.telefone_2, data.telefone_3].filter(Boolean).map(formatPhone))].join(" · ")} />
              </dl>
              <p className="mt-4 text-caption text-muted">Para mudar nome, documento ou endereço, fale com o atendimento.</p>
            </AccountCard>

            <AccountCard title="Endereços">
              <div className="space-y-4">
                <div>
                  <p className="text-caption font-semibold text-muted">Entrega</p>
                  <Address endereco={data.endereco_entrega} />
                </div>
                <div>
                  <p className="text-caption font-semibold text-muted">Rota de entrega</p>
                  <Route rota={rotaDoCliente(data)} />
                </div>
                <div>
                  <p className="text-caption font-semibold text-muted">Cadastro</p>
                  <Address endereco={data.endereco_cadastro} />
                </div>
              </div>
            </AccountCard>

            <AccountCard title="Atualizar contato" className="lg:col-span-3">
              <ContactForm initial={{ telefone1: formatPhone(data.telefone_1 ?? ""), telefone2: formatPhone(data.telefone_2 ?? ""), email: emailDoCliente(data), nascimento: nascimentoDoCliente(data) }} />
            </AccountCard>

            <AccountCard title="Trocar senha" className="lg:col-span-3">
              <PasswordForm />
            </AccountCard>
          </div>
        )}
      </div>
    </div>
  );
}
