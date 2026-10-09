"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCategory, getProducts } from "@/lib/catalog";
import { resolve4, resolveCname } from "node:dns/promises";
import {
  LOJISTA_TYPES,
  MARGIN_DEFAULT,
  WITHDRAW_MIN,
  balanceOf,
  cleanPixKey,
  customDomainError,
  linkSlugError,
  SOCIAL_KEYS,
  emailError,
  isPalette,
  marginError,
  parseMargin,
  passwordError,
  phoneDigits,
  planRoom,
  socialUrl,
  subdomainError,
  type LojistaType,
  type SocialKey,
} from "@/lib/multiloja/core";
import { endPainelSession, hashPassword, painelLimits, requestIp, requirePainel, startPainelSession, timingDummy, verifyPassword } from "@/lib/multiloja/auth";
import { deleteImage, saveImage } from "@/lib/multiloja/files";
import { dnsTarget, releaseDays, signupOpen } from "@/lib/multiloja/config";
import { createLink, createSaque, deleteLink, listComissoes, listSaques } from "@/lib/multiloja/repo-vendas";
import {
  activateProdutos,
  countLojaProdutos,
  createLojistaWithLoja,
  deactivateProdutos,
  domainTaken,
  setChavePix,
  emailTaken,
  findLojistaLogin,
  setProdutoDestaque,
  setProdutosMargem,
  subdomainTaken,
  touchLogin,
  updateLoja,
  updateLojista,
  updateLojistaPassword,
  type Banner,
} from "@/lib/multiloja/repo";

/*
 * Ações do painel do lojista. Toda ação que mexe na loja começa por requirePainel(): a loja vem da sessão,
 * nunca de um id enviado pelo formulário. Os formulários usam useActionState e recebem FormState.
 */

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> } | null;

const text = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

function tooMany(retryAfterSec: number): FormState {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return { message: `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.` };
}

// ---------------------------------------------------------------------------------- acesso

export async function entrar(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, "email", 160).toLowerCase();
  const senha = String(form.get("senha") ?? "");
  if (emailError(email) || !senha) return { message: "Informe e-mail e senha." };

  const ip = await requestIp();
  for (const [limiter, key] of [
    [painelLimits.loginIp, ip],
    [painelLimits.loginEmail, email],
  ] as const) {
    if (!key) continue;
    const hit = limiter.hit(key);
    if (!hit.ok) return tooMany(hit.retryAfterSec);
  }

  const lojista = findLojistaLogin(email);
  const valid = lojista ? await verifyPassword(senha, lojista.senhaHash) : (await verifyPassword(senha, await timingDummy()), false);
  if (!lojista || !valid) return { message: "E-mail ou senha incorretos." };
  if (lojista.status !== "ativo") return { message: "Seu acesso está suspenso. Fale com o suporte da Padrão Color." };

  painelLimits.loginEmail.reset(email);
  touchLogin(lojista.id);
  await startPainelSession(lojista.id);
  redirect("/painel");
}

export async function cadastrar(_prev: FormState, form: FormData): Promise<FormState> {
  const nome = text(form, "nome", 80);
  const email = text(form, "email", 160).toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const tipo = text(form, "tipo", 20) as LojistaType;
  const telefoneRaw = text(form, "telefone", 30);
  const lojaNome = text(form, "loja", 60);
  const subdominio = text(form, "subdominio", 40).toLowerCase();
  const aceite = form.get("aceite") === "on";
  if (!signupOpen()) return { message: "O cadastro de lojas está fechado. Fale com a Padrão Color para abrir a sua." };

  const errors: Record<string, string> = {};
  if (nome.length < 3) errors.nome = "Informe seu nome.";
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  const senhaProblem = passwordError(senha);
  if (senhaProblem) errors.senha = senhaProblem;
  if (!LOJISTA_TYPES.includes(tipo)) errors.tipo = "Escolha o seu perfil.";
  const telefone = phoneDigits(telefoneRaw);
  if (!telefone) errors.telefone = "Informe o WhatsApp com DDD.";
  if (lojaNome.length < 2) errors.loja = "Dê um nome para a sua loja.";
  const subProblem = subdomainError(subdominio);
  if (subProblem) errors.subdominio = subProblem;
  if (!aceite) errors.aceite = "É preciso aceitar os termos para criar a loja.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };

  const ip = await requestIp();
  if (ip) {
    const hit = painelLimits.signupIp.hit(ip);
    if (!hit.ok) return tooMany(hit.retryAfterSec);
  }

  if (emailTaken(email)) return { errors: { email: "Já existe uma loja com este e-mail. Entre com ele." }, message: "Confira os campos destacados." };
  if (subdomainTaken(subdominio)) return { errors: { subdominio: "Este endereço já é de outra loja." }, message: "Confira os campos destacados." };

  try {
    const { lojistaId } = createLojistaWithLoja({
      nome,
      email,
      senhaHash: await hashPassword(senha),
      tipo,
      telefone,
      loja: { nome: lojaNome, subdominio, margemPadrao: MARGIN_DEFAULT, whatsapp: telefone },
    });
    await startPainelSession(lojistaId);
  } catch (error) {
    // Corrida com outro cadastro igual (UNIQUE): mesma mensagem dos campos.
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return { message: "E-mail ou endereço da loja acabaram de ser usados. Tente outro." };
    throw error;
  }
  redirect("/painel?bemvindo=1");
}

export async function sair() {
  await endPainelSession();
  redirect("/painel/entrar");
}

// ---------------------------------------------------------------------------------- loja

export async function salvarLoja(_prev: FormState, form: FormData): Promise<FormState> {
  const { loja } = await requirePainel();
  const errors: Record<string, string> = {};

  const nome = text(form, "nome", 60);
  if (nome.length < 2) errors.nome = "Informe o nome da loja.";
  const slogan = text(form, "slogan", 120);
  const sobre = text(form, "sobre", 2000);

  const subdominio = text(form, "subdominio", 40).toLowerCase();
  const subProblem = subdomainError(subdominio);
  if (subProblem) errors.subdominio = subProblem;
  else if (subdomainTaken(subdominio, loja.id)) errors.subdominio = "Este endereço já é de outra loja.";

  const phoneField = (key: string, label: string) => {
    const raw = text(form, key, 30);
    if (!raw) return null;
    const digits = phoneDigits(raw);
    if (!digits) errors[key] = `${label} inválido. Use DDD + número.`;
    return digits;
  };
  const whatsapp = phoneField("whatsapp", "WhatsApp");
  const telefone = phoneField("telefone", "Telefone");

  const emailContato = text(form, "emailContato", 160).toLowerCase() || null;
  if (emailContato && emailError(emailContato)) errors.emailContato = "E-mail inválido.";

  const redes: Partial<Record<SocialKey, string>> = {};
  for (const key of SOCIAL_KEYS) {
    const url = socialUrl(key, text(form, `rede_${key}`, 200));
    if (url === null) errors[`rede_${key}`] = "Link inválido para esta rede.";
    else if (url) redes[key] = url;
  }

  const margem = parseMargin(text(form, "margemPadrao", 10));
  const margemProblem = marginError(margem);
  if (margemProblem) errors.margemPadrao = margemProblem;

  const categoriasDestaque = form
    .getAll("categorias")
    .map(String)
    .filter((slug) => getCategory(slug))
    .slice(0, 8);

  const money = (key: string) => {
    const raw = text(form, key, 12).replace(/[R$\s.]/g, "").replace(",", ".");
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 10_000) {
      errors[key] = "Valor inválido.";
      return null;
    }
    return Math.round(value * 100) / 100;
  };
  const freteFixo = money("freteFixo") ?? 0;
  const freteGratisAcima = money("freteGratisAcima");

  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };

  updateLoja(loja.id, { subdominio, nome, slogan, sobre, whatsapp, telefone, emailContato, redes, margemPadrao: margem, categoriasDestaque, freteFixo, freteGratisAcima });
  refresh();
  return { ok: true, message: subdominio !== loja.subdominio ? "Salvo. O endereço da loja mudou: divulgue o link novo." : "Dados da loja salvos." };
}

export async function salvarAparencia(_prev: FormState, form: FormData): Promise<FormState> {
  const { loja } = await requirePainel();
  const paleta = text(form, "paleta", 20);
  if (!isPalette(paleta)) return { message: "Escolha uma das cores." };

  const patch: Parameters<typeof updateLoja>[1] = { paleta };

  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const saved = await saveImage(loja.id, "logo", logo, 2 * 1024 * 1024);
    if (!saved.ok) return { errors: { logo: saved.error }, message: saved.error };
    await deleteImage(loja.id, loja.logo);
    patch.logo = saved.url;
  } else if (form.get("removerLogo") === "on") {
    await deleteImage(loja.id, loja.logo);
    patch.logo = null;
  }

  // Banners: mantém os existentes (menos os marcados para remover), atualiza texto/link e soma os novos (máx. 3).
  const banners: Banner[] = [];
  for (let i = 0; i < loja.banners.length; i++) {
    const current = loja.banners[i];
    if (form.get(`banner_remover_${i}`) === "on") {
      await deleteImage(loja.id, current.src);
      continue;
    }
    banners.push({ src: current.src, alt: text(form, `banner_alt_${i}`, 120), href: bannerHref(text(form, `banner_link_${i}`, 200)) });
  }
  const novo = form.get("banner_novo");
  if (novo instanceof File && novo.size > 0) {
    if (banners.length >= 3) return { errors: { banner_novo: "A loja já tem 3 banners. Remova um para enviar outro." }, message: "Limite de banners." };
    const saved = await saveImage(loja.id, "banner", novo, 5 * 1024 * 1024);
    if (!saved.ok) return { errors: { banner_novo: saved.error }, message: saved.error };
    banners.push({ src: saved.url, alt: text(form, "banner_novo_alt", 120), href: bannerHref(text(form, "banner_novo_link", 200)) });
  }
  patch.banners = banners;

  updateLoja(loja.id, patch);
  refresh();
  return { ok: true, message: "Aparência salva. Abra a loja para ver como ficou." };
}

/** Link do banner: só caminho interno da loja (/produtos?…, /produto/…), para não virar redirecionador. */
function bannerHref(raw: string): string | null {
  if (!raw) return null;
  return /^\/(?!\/)[\w\-/?=&%.]*$/.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------------- produtos

export type ProdutosResult = { ok: boolean; message: string };

const catalogIds = () => new Set(getProducts().map((p) => p.id));

function validIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const known = catalogIds();
  return [...new Set(ids.map(String))].filter((id) => known.has(id)).slice(0, 1000);
}

export async function ativarProdutos(ids: string[]): Promise<ProdutosResult> {
  const { loja } = await requirePainel();
  const list = validIds(ids);
  const room = planRoom(loja.plano, countLojaProdutos(loja.id));
  if (room <= 0) return { ok: false, message: "Seu plano chegou ao limite de produtos ativos. Desative algum ou mude de plano." };
  const added = activateProdutos(loja.id, list.slice(0, Number.isFinite(room) ? room : undefined));
  refresh();
  const skipped = list.length - added;
  if (Number.isFinite(room) && list.length > room) return { ok: true, message: `${added} ativados. ${list.length - room} ficaram de fora pelo limite do plano.` };
  return { ok: true, message: added === 1 ? "1 produto ativado." : `${added} produtos ativados.${skipped > 0 ? ` ${skipped} já estavam ativos.` : ""}` };
}

export async function desativarProdutos(ids: string[]): Promise<ProdutosResult> {
  const { loja } = await requirePainel();
  const removed = deactivateProdutos(loja.id, validIds(ids));
  refresh();
  return { ok: true, message: removed === 1 ? "1 produto desativado." : `${removed} produtos desativados.` };
}

/** Margem própria dos produtos (null = voltar à margem padrão da loja). Só vale para produtos ativos. */
export async function definirMargem(ids: string[], margem: number | null): Promise<ProdutosResult> {
  const { loja } = await requirePainel();
  if (margem !== null) {
    const problem = marginError(margem);
    if (problem) return { ok: false, message: problem };
  }
  const changed = setProdutosMargem(loja.id, validIds(ids), margem);
  refresh();
  if (changed === 0) return { ok: false, message: "Ative o produto antes de mudar a margem dele." };
  return { ok: true, message: margem === null ? `Margem padrão aplicada a ${changed} ${changed === 1 ? "produto" : "produtos"}.` : `Margem de ${margem}% aplicada a ${changed} ${changed === 1 ? "produto" : "produtos"}.` };
}

export async function marcarDestaque(id: string, destaque: boolean): Promise<ProdutosResult> {
  const { loja } = await requirePainel();
  const [valid] = validIds([id]);
  if (!valid) return { ok: false, message: "Produto não encontrado." };
  setProdutoDestaque(loja.id, valid, destaque);
  refresh();
  return { ok: true, message: destaque ? "Produto em destaque na página inicial." : "Produto fora dos destaques." };
}

// ---------------------------------------------------------------------------------- conta

export async function salvarConta(_prev: FormState, form: FormData): Promise<FormState> {
  const { lojista } = await requirePainel();
  const nome = text(form, "nome", 80);
  const telefoneRaw = text(form, "telefone", 30);
  const errors: Record<string, string> = {};
  if (nome.length < 3) errors.nome = "Informe seu nome.";
  const telefone = telefoneRaw ? phoneDigits(telefoneRaw) : null;
  if (telefoneRaw && !telefone) errors.telefone = "Telefone inválido.";
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };
  updateLojista(lojista.id, { nome, telefone });
  refresh();
  return { ok: true, message: "Dados salvos." };
}

export async function trocarSenha(_prev: FormState, form: FormData): Promise<FormState> {
  const { lojista } = await requirePainel();
  const atual = String(form.get("atual") ?? "");
  const nova = String(form.get("nova") ?? "");
  const login = findLojistaLogin(lojista.email);
  if (!login || !(await verifyPassword(atual, login.senhaHash))) return { errors: { atual: "Senha atual incorreta." }, message: "Senha atual incorreta." };
  const problem = passwordError(nova);
  if (problem) return { errors: { nova: problem }, message: problem };
  updateLojistaPassword(lojista.id, await hashPassword(nova));
  return { ok: true, message: "Senha alterada." };
}


// ---------------------------------------------------------------------------------- financeiro

export async function salvarChavePix(_prev: FormState, form: FormData): Promise<FormState> {
  const { lojista } = await requirePainel();
  const raw = text(form, "chavePix", 120);
  const chave = raw ? cleanPixKey(raw) : null;
  if (raw && !chave) return { errors: { chavePix: "Chave Pix inválida. Use CPF, CNPJ, e-mail, celular com +55 ou chave aleatória." }, message: "Chave Pix inválida." };
  setChavePix(lojista.id, chave);
  refresh();
  return { ok: true, message: chave ? "Chave Pix salva." : "Chave Pix removida." };
}

export async function solicitarSaque(_prev: FormState, form: FormData): Promise<FormState> {
  const { lojista, loja } = await requirePainel();
  if (!lojista.chavePix) return { message: "Cadastre a sua chave Pix antes de pedir o saque." };
  const valor = Math.round(Number(text(form, "valor", 12).replace(/[R$\s.]/g, "").replace(",", ".")) * 100) / 100;
  const saldo = balanceOf(listComissoes(loja.id), listSaques(loja.id), releaseDays());
  if (!Number.isFinite(valor) || valor < WITHDRAW_MIN) return { errors: { valor: `O saque mínimo é de R$ ${WITHDRAW_MIN},00.` }, message: "Valor abaixo do mínimo." };
  if (valor > saldo.available + 0.001) return { errors: { valor: "O valor passa do saldo disponível." }, message: "Saldo insuficiente." };
  createSaque(loja.id, valor, lojista.chavePix);
  refresh();
  return { ok: true, message: "Saque solicitado. A Padrão Color faz o Pix em até 2 dias úteis." };
}

// ---------------------------------------------------------------------------------- divulgação

export async function criarLink(_prev: FormState, form: FormData): Promise<FormState> {
  const { loja } = await requirePainel();
  const nome = text(form, "nome", 60);
  const slug = text(form, "slug", 30).toLowerCase();
  const errors: Record<string, string> = {};
  if (nome.length < 2) errors.nome = "Dê um nome ao link (ex.: Bio do Instagram).";
  const slugProblem = linkSlugError(slug);
  if (slugProblem) errors.slug = slugProblem;
  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };
  if (!createLink(loja.id, slug, nome)) return { errors: { slug: "Já existe um link com este nome curto." }, message: "Nome curto repetido." };
  refresh();
  return { ok: true, message: "Link criado. Copie e use na divulgação." };
}

export async function removerLink(id: number) {
  const { loja } = await requirePainel();
  if (Number.isInteger(id)) deleteLink(loja.id, id);
  refresh();
}

// ---------------------------------------------------------------------------------- domínio próprio

export async function salvarDominio(_prev: FormState, form: FormData): Promise<FormState> {
  const { loja } = await requirePainel();
  const dominio = text(form, "dominio", 253).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!dominio) {
    updateLoja(loja.id, { dominio: null, dominioVerificado: false });
    refresh();
    return { ok: true, message: "Domínio próprio removido. A loja segue no endereço da multiloja." };
  }
  const problem = customDomainError(dominio);
  if (problem) return { errors: { dominio: problem }, message: problem };
  if (domainTaken(dominio, loja.id)) return { errors: { dominio: "Este domínio já está em outra loja." }, message: "Domínio em uso." };
  if (dominio !== loja.dominio) updateLoja(loja.id, { dominio, dominioVerificado: false });
  return verificar(loja.id, dominio);
}

/** Confere o DNS: o domínio precisa apontar (CNAME ou mesmo IP) para MULTILOJA_DNS_ALVO. */
async function verificar(lojaId: number, dominio: string): Promise<FormState> {
  const target = dnsTarget();
  if (!target) return { ok: true, message: "Domínio salvo. A verificação do DNS será feita pela Padrão Color." };
  let ok = false;
  try {
    const cnames = await resolveCname(dominio).catch(() => [] as string[]);
    ok = cnames.some((c) => c.toLowerCase().replace(/\.$/, "") === target);
    if (!ok) {
      const [mine, theirs] = await Promise.all([resolve4(dominio).catch(() => [] as string[]), resolve4(target).catch(() => [] as string[])]);
      ok = mine.length > 0 && mine.every((ip) => theirs.includes(ip));
    }
  } catch {
    ok = false;
  }
  updateLoja(lojaId, { dominioVerificado: ok });
  refresh();
  return ok
    ? { ok: true, message: "Domínio verificado! A loja já responde nele (o certificado HTTPS pode levar alguns minutos)." }
    : { message: `O DNS ainda não aponta para ${target}. Crie o CNAME e tente de novo (a propagação pode levar algumas horas).` };
}

export async function verificarDominio(): Promise<FormState> {
  const { loja } = await requirePainel();
  if (!loja.dominio) return { message: "Cadastre o domínio primeiro." };
  return verificar(loja.id, loja.dominio);
}
