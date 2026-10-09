"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCategory, getProducts } from "@/lib/catalog";
import {
  LOJISTA_TYPES,
  MARGIN_DEFAULT,
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
import {
  activateProdutos,
  countLojaProdutos,
  createLojistaWithLoja,
  deactivateProdutos,
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

  if (Object.keys(errors).length) return { errors, message: "Confira os campos destacados." };

  updateLoja(loja.id, { subdominio, nome, slogan, sobre, whatsapp, telefone, emailContato, redes, margemPadrao: margem, categoriasDestaque });
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

