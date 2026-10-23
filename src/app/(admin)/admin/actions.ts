"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { LOJISTA_TYPES, MARGIN_DEFAULT, emailError, isOrderStatus, isPlan, ORDER_NEXT, phoneDigits, subdomainError, type LojistaType } from "@/lib/multiloja/core";
import { endAdminSession, hashPassword, painelLimits, requestIp, requireAdmin, startAdminSession, timingDummy, verifyPassword } from "@/lib/multiloja/auth";
import { createLojistaWithLoja, emailTaken, getLoja, getLojista, setLojistaStatus, subdomainTaken, updateLoja, updateLojistaPassword } from "@/lib/multiloja/repo";
import { findAdminLogin, getPedidoByCodigo, resolveSaque, setPedidoStatus, touchAdminLogin } from "@/lib/multiloja/repo-vendas";
import { cancelOrder, sendToProduction } from "@/lib/multiloja/vendas";
import { randomBytes } from "node:crypto";
import { chargeStatus, GATEWAYS, registerPixWebhook, sandboxTestPix } from "@/lib/multiloja/payments";
import { CIELO_SETTINGS_KEY, EFI_SETTINGS_KEY, PAGARME_SETTINGS_KEY, PAYMENT_SETTINGS_KEY, SIGNUP_OPEN_KEY, isPagarmeSecretKey, paymentSettings, type CieloSaved, type EfiSaved, type PagarmeSaved, type PaymentSettings } from "@/lib/multiloja/config";
import { PAYMENT_KINDS, type PaymentRates } from "@/lib/multiloja/core";
import { GATEWAY_LABEL, isGatewayName, isRota, listaFormas, ROTAS_DESLIGADAS, usarParaTudo, type Rotas } from "@/lib/multiloja/pagamento-rotas";
import { getSetting, sealSecret, setSetting } from "@/lib/multiloja/settings";
import type { FormState } from "@/app/(painel)/painel/actions";

/*
 * Ações do admin da multiloja (equipe da Padrão Color). Toda ação começa por requireAdmin() e registra quem fez
 * no histórico do pedido.
 */

export async function entrarAdmin(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const senha = String(form.get("senha") ?? "");
  if (emailError(email) || !senha) return { message: "Informe e-mail e senha." };
  const ip = await requestIp();
  for (const [limiter, key] of [
    [painelLimits.loginIp, ip ? `admin:${ip}` : null],
    [painelLimits.loginEmail, `admin:${email}`],
  ] as const) {
    if (!key) continue;
    const hit = limiter.hit(key);
    if (!hit.ok) return { message: "Muitas tentativas. Tente de novo em alguns minutos." };
  }
  const admin = await findAdminLogin(email);
  const valid = admin ? await verifyPassword(senha, admin.senhaHash) : (await verifyPassword(senha, await timingDummy()), false);
  if (!admin || !valid) return { message: "E-mail ou senha incorretos." };
  await touchAdminLogin(admin.id);
  await startAdminSession(admin.id);
  redirect("/admin");
}

export async function sairAdmin() {
  await endAdminSession();
  redirect("/admin/entrar");
}

export type AdminResult = { ok: boolean; message: string; payload?: string };

export async function mudarStatus(codigo: string, status: string, nota: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const pedido = await getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (!isOrderStatus(status) || !ORDER_NEXT[pedido.status].includes(status)) return { ok: false, message: "Mudança de status não permitida." };
  if (status === "cancelado") {
    // Pedido pago: devolve o Pix / estorna o cartão na Efí antes de cancelar.
    const result = await cancelOrder(pedido, `admin:${admin.email}`, nota.trim().slice(0, 300));
    refresh();
    return result;
  }
  await setPedidoStatus(pedido.id, status, `admin:${admin.email}`, nota.trim().slice(0, 300));
  refresh();
  return { ok: true, message: "Status atualizado." };
}

export async function enviarProducao(codigo: string): Promise<AdminResult> {
  await requireAdmin();
  const pedido = await getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (pedido.status !== "pago") return { ok: false, message: "Só pedidos pagos vão para a produção." };
  const result = await sendToProduction(pedido);
  refresh();
  if (!result.ok) return { ok: false, message: result.message };
  // Itens sem arquivo: a Padrão precisa da arte por outro caminho (o comprador ainda não enviou ou o Bunny está desligado).
  const semArte = result.semArte.length ? ` Sem arte: ${result.semArte.join(", ")}.` : "";
  return {
    ok: true,
    message:
      (result.simulated ? "Simulação: pedido marcado em produção, sem chamar a API (PADRAO_ORDERS_ENABLED desligado ou sem cliente da multiloja)." : `Enviado à Padrão${result.numero ? ` (pedido ${result.numero})` : ""}.`) + semArte,
    payload: JSON.stringify(result.payload, null, 2),
  };
}

export async function definirPlano(lojaId: number, plano: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isPlan(plano) || !(await getLoja(lojaId))) return { ok: false, message: "Plano ou loja inválidos." };
  await updateLoja(lojaId, { plano });
  refresh();
  return { ok: true, message: "Plano atualizado." };
}

export async function alternarLoja(lojaId: number, ativa: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!(await getLoja(lojaId))) return { ok: false, message: "Loja não encontrada." };
  await updateLoja(lojaId, { ativa });
  refresh();
  return { ok: true, message: ativa ? "Loja reativada." : "Loja fora do ar." };
}

export async function marcarDominio(lojaId: number, verificado: boolean): Promise<AdminResult> {
  await requireAdmin();
  const loja = await getLoja(lojaId);
  if (!loja?.dominio) return { ok: false, message: "A loja não tem domínio próprio cadastrado." };
  await updateLoja(lojaId, { dominioVerificado: verificado });
  refresh();
  return { ok: true, message: verificado ? `Domínio ${loja.dominio} liberado.` : "Domínio desligado." };
}

export async function bloquearLojista(lojistaId: number, bloquear: boolean): Promise<AdminResult> {
  await requireAdmin();
  await setLojistaStatus(lojistaId, bloquear ? "bloqueado" : "ativo");
  refresh();
  return { ok: true, message: bloquear ? "Acesso do lojista bloqueado." : "Acesso do lojista liberado." };
}

export async function resolverSaque(id: number, status: "pago" | "recusado", nota: string): Promise<AdminResult> {
  await requireAdmin();
  if (status !== "pago" && status !== "recusado") return { ok: false, message: "Situação inválida." };
  if (status === "recusado" && !nota.trim()) return { ok: false, message: "Diga o motivo da recusa (o lojista vê)." };
  const done = await resolveSaque(id, status, nota.trim().slice(0, 200));
  refresh();
  return done ? { ok: true, message: status === "pago" ? "Saque marcado como pago." : "Saque recusado; o valor volta ao saldo do lojista." } : { ok: false, message: "Este saque já foi resolvido." };
}

// ---------------------------------------------------------------------------------- pagamentos (gateway por forma, taxas)

/**
 * "Usar para tudo": o gateway passa a cobrar todas as formas que sabe cobrar (a Pagar.me só o Pix); as outras formas
 * continuam como estavam. "desligado" tira o pagamento online de todas as formas.
 */
export async function ativarGateway(nome: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const current = await paymentSettings();
  if (nome === "desligado") {
    await setSetting(PAYMENT_SETTINGS_KEY, { ...current, rotas: ROTAS_DESLIGADAS } satisfies PaymentSettings);
    console.info(`[multiloja] pagamento online desligado (por ${admin.email})`);
    refresh();
    return { ok: true, message: "Pagamento online desligado: os pedidos seguem pelo WhatsApp das lojas." };
  }
  if (!isGatewayName(nome)) return { ok: false, message: "Gateway desconhecido." };
  if (nome === "simulado" && process.env.NODE_ENV === "production") return { ok: false, message: "A simulação não pode cobrar em produção." };
  const gateway = GATEWAYS[nome];
  if (!(await gateway.configured())) return { ok: false, message: "Preencha e salve as credenciais deste gateway antes de usar." };
  const formas = await gateway.methods();
  await setSetting(PAYMENT_SETTINGS_KEY, { ...current, rotas: usarParaTudo(current.rotas, nome, formas) } satisfies PaymentSettings);
  console.info(`[multiloja] ${nome} passa a cobrar ${formas.join(", ")} (por ${admin.email})`);
  refresh();
  const resto = formas.length < PAYMENT_KINDS.length ? " As outras formas continuam como estavam." : "";
  return { ok: true, message: `Pronto: ${listaFormas(formas)} ${formas.length === 1 ? "passa" : "passam"} pela ${gateway.label}.${resto}` };
}

const money = (raw: FormDataEntryValue | null) => {
  const value = Number(String(raw ?? "").replace(/[R$\s]/g, "").replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : NaN;
};

/** Quem cobra cada forma, taxas e vencimento do boleto. Gateway sem credenciais ou que não cobra a forma é recusado. */
export async function salvarMeios(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const current = await paymentSettings();
  const rotas: Rotas = { ...ROTAS_DESLIGADAS };
  const errors: Record<string, string> = {};
  for (const k of PAYMENT_KINDS) {
    const rota = form.get(`rota_${k}`);
    if (!isRota(rota)) {
      errors[`rota_${k}`] = "Escolha um gateway ou Desligado.";
      continue;
    }
    rotas[k] = rota;
    if (rota === "desligado") continue;
    const gateway = GATEWAYS[rota];
    if (rota === "simulado" && process.env.NODE_ENV === "production") errors[`rota_${k}`] = "A simulação não cobra em produção.";
    else if (!(await gateway.configured())) errors[`rota_${k}`] = `Salve as credenciais da ${GATEWAY_LABEL[rota]} antes.`;
    else if (!(await gateway.methods()).includes(k)) errors[`rota_${k}`] = rota === "cielo" && k === "cartao" ? "Cartão na Cielo precisa das credenciais do Link de Pagamento." : `A ${GATEWAY_LABEL[rota]} não cobra ${listaFormas([k])} nesta integração.`;
  }
  const taxas = {} as PaymentRates;
  for (const k of PAYMENT_KINDS) {
    const pct = money(form.get(`taxa_${k}_pct`));
    const fixed = money(form.get(`taxa_${k}_fixo`));
    if (!Number.isFinite(pct) || pct > 20) errors[`taxa_${k}_pct`] = "0 a 20%";
    if (!Number.isFinite(fixed) || fixed > 50) errors[`taxa_${k}_fixo`] = "R$ 0 a 50";
    taxas[k] = { pct: Number.isFinite(pct) ? pct : 0, fixed: Number.isFinite(fixed) ? fixed : 0 };
  }
  const boletoDias = Math.round(Number(form.get("boletoDias")));
  if (!Number.isInteger(boletoDias) || boletoDias < 1 || boletoDias > 30) errors.boletoDias = "1 a 30 dias";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };
  await setSetting(PAYMENT_SETTINGS_KEY, { ...current, rotas, taxas, boletoDias } satisfies PaymentSettings);
  refresh();
  const ligadas = PAYMENT_KINDS.filter((k) => rotas[k] !== "desligado");
  return { ok: true, message: ligadas.length ? "Formas de pagamento e taxas salvas." : "Salvo com todas as formas desligadas: os pedidos seguem pelo WhatsApp das lojas." };
}

const field = (form: FormData, name: string, max = 300) => String(form.get(name) ?? "").trim().slice(0, max);

/** Credenciais da Efí. Campo secreto em branco = mantém o que já estava salvo. */
export async function salvarEfi(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const saved = (await getSetting<EfiSaved>(EFI_SETTINGS_KEY)) ?? {};
  const next: EfiSaved = {
    sandbox: form.get("sandbox") === "on",
    clientId: field(form, "clientId", 200),
    pixKey: field(form, "pixKey", 120),
    clientSecret: saved.clientSecret,
    certBase64: saved.certBase64,
    webhookSecret: saved.webhookSecret ?? sealSecret(randomBytes(24).toString("base64url")),
  };
  const secret = field(form, "clientSecret", 300);
  if (secret) next.clientSecret = sealSecret(secret);
  const cert = form.get("certificado");
  if (cert instanceof File && cert.size > 0) {
    if (cert.size > 64 * 1024 || !/\.(p12|pfx)$/i.test(cert.name)) return { errors: { certificado: "Envie o arquivo .p12 da Efí (até 64 KB)." }, message: "Certificado inválido." };
    next.certBase64 = sealSecret(Buffer.from(await cert.arrayBuffer()).toString("base64"));
  }
  const errors: Record<string, string> = {};
  if (!next.clientId) errors.clientId = "Informe o Client ID.";
  if (!next.clientSecret) errors.clientSecret = "Informe o Client Secret.";
  if (!next.certBase64) errors.certificado = "Envie o certificado .p12.";
  if (!next.pixKey) errors.pixKey = "Informe a chave Pix da conta.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };
  await setSetting(EFI_SETTINGS_KEY, next);
  refresh();
  return { ok: true, message: "Credenciais da Efí salvas. Confira o diagnóstico abaixo." };
}

/** Credenciais da Cielo. Campo secreto em branco = mantém o que já estava salvo. */
export async function salvarCielo(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const saved = (await getSetting<CieloSaved>(CIELO_SETTINGS_KEY)) ?? {};
  const next: CieloSaved = {
    sandbox: form.get("sandbox") === "on",
    merchantId: field(form, "merchantId", 100),
    boletoProvider: field(form, "boletoProvider", 40),
    clientId: field(form, "clientId", 200),
    merchantKey: saved.merchantKey,
    clientSecret: saved.clientSecret,
    webhookSecret: saved.webhookSecret ?? sealSecret(randomBytes(24).toString("base64url")),
  };
  const merchantKey = field(form, "merchantKey", 200);
  if (merchantKey) next.merchantKey = sealSecret(merchantKey);
  const clientSecret = field(form, "clientSecret", 300);
  if (clientSecret) next.clientSecret = sealSecret(clientSecret);
  const errors: Record<string, string> = {};
  if (!/^[0-9a-f-]{36}$/i.test(next.merchantId ?? "")) errors.merchantId = "MerchantId no formato da Cielo (36 caracteres).";
  if (!next.merchantKey) errors.merchantKey = "Informe a MerchantKey.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };
  await setSetting(CIELO_SETTINGS_KEY, next);
  refresh();
  return { ok: true, message: "Credenciais da Cielo salvas. Confira o diagnóstico abaixo." };
}

/** Chave secreta da Pagar.me. Em branco = mantém a salva. O segredo dos avisos é gerado na primeira vez. */
export async function salvarPagarme(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const saved = (await getSetting<PagarmeSaved>(PAGARME_SETTINGS_KEY)) ?? {};
  const next: PagarmeSaved = { secretKey: saved.secretKey, webhookSecret: saved.webhookSecret ?? sealSecret(randomBytes(24).toString("base64url")) };
  const secretKey = field(form, "secretKey", 200);
  if (secretKey) {
    if (!isPagarmeSecretKey(secretKey)) return { errors: { secretKey: "Use a chave SECRETA (começa com sk_test_ ou sk_), não a pública (pk_)." }, message: "Confira a chave." };
    next.secretKey = sealSecret(secretKey);
  }
  if (!next.secretKey) return { errors: { secretKey: "Informe a chave secreta da Pagar.me." }, message: "Confira a chave." };
  await setSetting(PAGARME_SETTINGS_KEY, next);
  refresh();
  return { ok: true, message: "Chave da Pagar.me salva. Confira o diagnóstico e escolha a Pagar.me para o Pix." };
}

// ---------------------------------------------------------------------------------- Efí: webhook e teste

export async function efiCadastrarWebhook(): Promise<AdminResult> {
  await requireAdmin();
  return registerPixWebhook();
}

export async function efiPixTeste(): Promise<Awaited<ReturnType<typeof sandboxTestPix>>> {
  await requireAdmin();
  return sandboxTestPix();
}

export async function efiConsultarTeste(txid: string): Promise<AdminResult> {
  await requireAdmin();
  if (!/^[a-zA-Z0-9]{26,35}$/.test(txid)) return { ok: false, message: "Identificador inválido." };
  try {
    const result = await chargeStatus("efi", txid);
    return { ok: true, message: result.status === "pago" ? `Pago (e2eId ${result.e2eId ?? "?"}).` : result.status === "expirado" ? "Cobrança removida." : "Ainda aguardando pagamento." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erro ao consultar a Efí." };
  }
}

// ---------------------------------------------------------------------------------- lojistas (cadastro pela Padrão)

/** Senha provisória legível (sem 0/O/1/l), 12 caracteres. */
function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

export type CreatedLojista = (NonNullable<FormState> & { senha?: string; loja?: string }) | null;

export async function criarLojista(_prev: FormState, form: FormData): Promise<CreatedLojista> {
  await requireAdmin();
  const nome = field(form, "nome", 80);
  const email = field(form, "email", 160).toLowerCase();
  const telefone = phoneDigits(field(form, "telefone", 30));
  const tipo = field(form, "tipo", 20) as LojistaType;
  const lojaNome = field(form, "loja", 60);
  const subdominio = field(form, "subdominio", 40).toLowerCase();
  const plano = field(form, "plano", 20);
  const errors: Record<string, string> = {};
  if (nome.length < 3) errors.nome = "Informe o nome.";
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  else if (await emailTaken(email)) errors.email = "Já existe um lojista com este e-mail.";
  if (!telefone) errors.telefone = "WhatsApp com DDD.";
  if (!LOJISTA_TYPES.includes(tipo)) errors.tipo = "Escolha o perfil.";
  if (lojaNome.length < 2) errors.loja = "Nome da loja.";
  const subProblem = subdomainError(subdominio);
  if (subProblem) errors.subdominio = subProblem;
  else if (await subdomainTaken(subdominio)) errors.subdominio = "Endereço já usado por outra loja.";
  if (!isPlan(plano)) errors.plano = "Escolha o plano.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };

  const senha = tempPassword();
  const { lojaId } = await createLojistaWithLoja({ nome, email, senhaHash: await hashPassword(senha), tipo, telefone, loja: { nome: lojaNome, subdominio, margemPadrao: MARGIN_DEFAULT, whatsapp: telefone } });
  if (isPlan(plano)) await updateLoja(lojaId, { plano });
  refresh();
  return { ok: true, message: `Loja ${lojaNome} criada.`, senha, loja: subdominio };
}

/** Gera uma senha provisória nova para o lojista (mostrada uma vez para a Padrão repassar). */
export async function redefinirSenhaLojista(lojistaId: number): Promise<AdminResult & { senha?: string }> {
  await requireAdmin();
  const lojista = await getLojista(lojistaId);
  if (!lojista) return { ok: false, message: "Lojista não encontrado." };
  const senha = tempPassword();
  await updateLojistaPassword(lojistaId, await hashPassword(senha));
  return { ok: true, message: `Senha nova de ${lojista.email}:`, senha };
}

export async function alternarCadastro(aberto: boolean): Promise<AdminResult> {
  await requireAdmin();
  await setSetting(SIGNUP_OPEN_KEY, aberto);
  refresh();
  return { ok: true, message: aberto ? "Cadastro aberto: qualquer pessoa pode criar loja em /painel/cadastro." : "Cadastro fechado: só a Padrão cria lojas, por aqui." };
}
