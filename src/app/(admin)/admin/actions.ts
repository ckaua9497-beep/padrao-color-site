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
import { CIELO_SETTINGS_KEY, EFI_SETTINGS_KEY, PAYMENT_SETTINGS_KEY, SIGNUP_OPEN_KEY, paymentSettings, type CieloSaved, type EfiSaved, type PaymentSettings } from "@/lib/multiloja/config";
import { PAYMENT_KINDS, type PaymentRates } from "@/lib/multiloja/core";
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
  const admin = findAdminLogin(email);
  const valid = admin ? await verifyPassword(senha, admin.senhaHash) : (await verifyPassword(senha, await timingDummy()), false);
  if (!admin || !valid) return { message: "E-mail ou senha incorretos." };
  touchAdminLogin(admin.id);
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
  const pedido = getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (!isOrderStatus(status) || !ORDER_NEXT[pedido.status].includes(status)) return { ok: false, message: "Mudança de status não permitida." };
  if (status === "cancelado") {
    // Pedido pago: devolve o Pix / estorna o cartão na Efí antes de cancelar.
    const result = await cancelOrder(pedido, `admin:${admin.email}`, nota.trim().slice(0, 300));
    refresh();
    return result;
  }
  setPedidoStatus(pedido.id, status, `admin:${admin.email}`, nota.trim().slice(0, 300));
  refresh();
  return { ok: true, message: "Status atualizado." };
}

export async function enviarProducao(codigo: string): Promise<AdminResult> {
  await requireAdmin();
  const pedido = getPedidoByCodigo(codigo);
  if (!pedido) return { ok: false, message: "Pedido não encontrado." };
  if (pedido.status !== "pago") return { ok: false, message: "Só pedidos pagos vão para a produção." };
  const result = await sendToProduction(pedido);
  refresh();
  if (!result.ok) return { ok: false, message: result.message };
  return {
    ok: true,
    message: result.simulated ? "Simulação: pedido marcado em produção, sem chamar a API (PADRAO_ORDERS_ENABLED desligado ou sem cliente da multiloja)." : `Enviado à Padrão${result.numero ? ` (pedido ${result.numero})` : ""}.`,
    payload: JSON.stringify(result.payload, null, 2),
  };
}

export async function definirPlano(lojaId: number, plano: string): Promise<AdminResult> {
  await requireAdmin();
  if (!isPlan(plano) || !getLoja(lojaId)) return { ok: false, message: "Plano ou loja inválidos." };
  updateLoja(lojaId, { plano });
  refresh();
  return { ok: true, message: "Plano atualizado." };
}

export async function alternarLoja(lojaId: number, ativa: boolean): Promise<AdminResult> {
  await requireAdmin();
  if (!getLoja(lojaId)) return { ok: false, message: "Loja não encontrada." };
  updateLoja(lojaId, { ativa });
  refresh();
  return { ok: true, message: ativa ? "Loja reativada." : "Loja fora do ar." };
}

export async function marcarDominio(lojaId: number, verificado: boolean): Promise<AdminResult> {
  await requireAdmin();
  const loja = getLoja(lojaId);
  if (!loja?.dominio) return { ok: false, message: "A loja não tem domínio próprio cadastrado." };
  updateLoja(lojaId, { dominioVerificado: verificado });
  refresh();
  return { ok: true, message: verificado ? `Domínio ${loja.dominio} liberado.` : "Domínio desligado." };
}

export async function bloquearLojista(lojistaId: number, bloquear: boolean): Promise<AdminResult> {
  await requireAdmin();
  setLojistaStatus(lojistaId, bloquear ? "bloqueado" : "ativo");
  refresh();
  return { ok: true, message: bloquear ? "Acesso do lojista bloqueado." : "Acesso do lojista liberado." };
}

export async function resolverSaque(id: number, status: "pago" | "recusado", nota: string): Promise<AdminResult> {
  await requireAdmin();
  if (status !== "pago" && status !== "recusado") return { ok: false, message: "Situação inválida." };
  if (status === "recusado" && !nota.trim()) return { ok: false, message: "Diga o motivo da recusa (o lojista vê)." };
  const done = resolveSaque(id, status, nota.trim().slice(0, 200));
  refresh();
  return done ? { ok: true, message: status === "pago" ? "Saque marcado como pago." : "Saque recusado; o valor volta ao saldo do lojista." } : { ok: false, message: "Este saque já foi resolvido." };
}

// ---------------------------------------------------------------------------------- pagamentos (gateway, meios, taxas)

/** Liga um gateway para TODAS as cobranças novas (ou desliga o pagamento online). */
export async function ativarGateway(nome: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (nome !== "desligado" && !(nome in GATEWAYS)) return { ok: false, message: "Gateway desconhecido." };
  if (nome !== "desligado" && !GATEWAYS[nome as keyof typeof GATEWAYS].configured()) return { ok: false, message: "Preencha e salve as credenciais deste gateway antes de ativar." };
  if (nome === "simulado" && process.env.NODE_ENV === "production") return { ok: false, message: "A simulação não pode cobrar em produção." };
  const current = paymentSettings();
  setSetting(PAYMENT_SETTINGS_KEY, { ...current, ativo: nome as PaymentSettings["ativo"] } satisfies PaymentSettings);
  console.info(`[multiloja] gateway ativo: ${nome} (por ${admin.email})`);
  refresh();
  return { ok: true, message: nome === "desligado" ? "Pagamento online desligado: os pedidos seguem pelo WhatsApp das lojas." : `Pronto: as cobranças novas passam pela ${GATEWAYS[nome as keyof typeof GATEWAYS].label}.` };
}

const money = (raw: FormDataEntryValue | null) => {
  const value = Number(String(raw ?? "").replace(/[R$\s]/g, "").replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : NaN;
};

export async function salvarMeios(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const current = paymentSettings();
  const metodos = Object.fromEntries(PAYMENT_KINDS.map((k) => [k, form.get(`metodo_${k}`) === "on"])) as PaymentSettings["metodos"];
  if (!Object.values(metodos).some(Boolean)) return { message: "Deixe pelo menos uma forma de pagamento ligada." };
  const taxas = {} as PaymentRates;
  const errors: Record<string, string> = {};
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
  setSetting(PAYMENT_SETTINGS_KEY, { ...current, metodos, taxas, boletoDias } satisfies PaymentSettings);
  refresh();
  return { ok: true, message: "Formas de pagamento e taxas salvas." };
}

const field = (form: FormData, name: string, max = 300) => String(form.get(name) ?? "").trim().slice(0, max);

/** Credenciais da Efí. Campo secreto em branco = mantém o que já estava salvo. */
export async function salvarEfi(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const saved = getSetting<EfiSaved>(EFI_SETTINGS_KEY) ?? {};
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
  setSetting(EFI_SETTINGS_KEY, next);
  refresh();
  return { ok: true, message: "Credenciais da Efí salvas. Confira o diagnóstico abaixo." };
}

/** Credenciais da Cielo. Campo secreto em branco = mantém o que já estava salvo. */
export async function salvarCielo(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const saved = getSetting<CieloSaved>(CIELO_SETTINGS_KEY) ?? {};
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
  setSetting(CIELO_SETTINGS_KEY, next);
  refresh();
  return { ok: true, message: "Credenciais da Cielo salvas. Confira o diagnóstico abaixo." };
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
  else if (emailTaken(email)) errors.email = "Já existe um lojista com este e-mail.";
  if (!telefone) errors.telefone = "WhatsApp com DDD.";
  if (!LOJISTA_TYPES.includes(tipo)) errors.tipo = "Escolha o perfil.";
  if (lojaNome.length < 2) errors.loja = "Nome da loja.";
  const subProblem = subdomainError(subdominio);
  if (subProblem) errors.subdominio = subProblem;
  else if (subdomainTaken(subdominio)) errors.subdominio = "Endereço já usado por outra loja.";
  if (!isPlan(plano)) errors.plano = "Escolha o plano.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };

  const senha = tempPassword();
  const { lojaId } = createLojistaWithLoja({ nome, email, senhaHash: await hashPassword(senha), tipo, telefone, loja: { nome: lojaNome, subdominio, margemPadrao: MARGIN_DEFAULT, whatsapp: telefone } });
  if (isPlan(plano)) updateLoja(lojaId, { plano });
  refresh();
  return { ok: true, message: `Loja ${lojaNome} criada.`, senha, loja: subdominio };
}

/** Gera uma senha provisória nova para o lojista (mostrada uma vez para a Padrão repassar). */
export async function redefinirSenhaLojista(lojistaId: number): Promise<AdminResult & { senha?: string }> {
  await requireAdmin();
  const lojista = getLojista(lojistaId);
  if (!lojista) return { ok: false, message: "Lojista não encontrado." };
  const senha = tempPassword();
  updateLojistaPassword(lojistaId, await hashPassword(senha));
  return { ok: true, message: `Senha nova de ${lojista.email}:`, senha };
}

export async function alternarCadastro(aberto: boolean): Promise<AdminResult> {
  await requireAdmin();
  setSetting(SIGNUP_OPEN_KEY, aberto);
  refresh();
  return { ok: true, message: aberto ? "Cadastro aberto: qualquer pessoa pode criar loja em /painel/cadastro." : "Cadastro fechado: só a Padrão cria lojas, por aqui." };
}
