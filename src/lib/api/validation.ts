// Regras dos dados que vão para a API (cadastro, conta, recuperação e entrega). Módulo puro: roda no
// navegador (formulários) e no servidor (route handlers), e é testado com node --test.

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/** Documento sem pontuação. CNPJ pode ser alfanumérico (Receita Federal, a partir de julho de 2026). */
export function cleanDocument(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(d[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** CNPJ numérico ou alfanumérico: cada caractere vale o código ASCII − 48; os dois dígitos finais são numéricos. */
export function isValidCnpj(value: string): boolean {
  const d = cleanDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += (d.charCodeAt(i) - 48) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

export type DocumentKind = "cpf" | "cnpj";

/** Tipo pelo tamanho (11 = CPF, 14 = CNPJ), sem validar os dígitos. */
export function documentKind(value: string): DocumentKind | null {
  const d = cleanDocument(value);
  if (/^\d{11}$/.test(d)) return "cpf";
  if (d.length === 14) return "cnpj";
  return null;
}

export function isValidDocument(value: string): boolean {
  const kind = documentKind(value);
  return kind === "cpf" ? isValidCpf(value) : kind === "cnpj" ? isValidCnpj(value) : false;
}

/** Máscara progressiva enquanto digita: 000.000.000-00 ou 00.000.000/0000-00. */
export function formatDocument(value: string): string {
  const d = cleanDocument(value).slice(0, 14);
  if (d.length <= 11 && /^\d*$/.test(d)) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(\w{2})(\w)/, "$1.$2")
    .replace(/^(\w{2})\.(\w{3})(\w)/, "$1.$2.$3")
    .replace(/\.(\w{3})(\w)/, ".$1/$2")
    .replace(/(\w{4})(\d{1,2})$/, "$1-$2");
}

/** Documento para exibir: CPF com o começo e o fim ocultos (***.982.247-**); CNPJ (público) formatado. */
export function maskDocument(value: string): string {
  const kind = documentKind(value);
  const d = cleanDocument(value);
  if (kind === "cpf") return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (kind === "cnpj") return formatDocument(d);
  return d ? "***" : "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 120 && EMAIL.test(email);
}

export const PASSWORD_RULES = { min: 8, max: 30 } as const;

/** Problemas da senha nova (vazio = senha aceita). A regra da API não é documentada: mínimo do site. */
export function passwordProblems(value: string): string[] {
  const problems: string[] = [];
  if (value.length < PASSWORD_RULES.min) problems.push(`pelo menos ${PASSWORD_RULES.min} caracteres`);
  if (value.length > PASSWORD_RULES.max) problems.push(`no máximo ${PASSWORD_RULES.max} caracteres`);
  if (!/[A-Za-zÀ-ÿ]/.test(value)) problems.push("uma letra");
  if (!/\d/.test(value)) problems.push("um número");
  if (/\s/.test(value)) problems.push("sem espaços");
  return problems;
}

export function passwordMessage(value: string): string | null {
  const problems = passwordProblems(value);
  return problems.length ? `A senha precisa de ${problems.join(", ")}.` : null;
}

/** Telefone com DDD: 10 (fixo) ou 11 dígitos (celular). */
export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return (d.length === 10 || d.length === 11) && !d.startsWith("0");
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidCep(value: string): boolean {
  return onlyDigits(value).length === 8;
}

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

export function isValidUf(value: string): boolean {
  return (UFS as readonly string[]).includes(value.trim().toUpperCase());
}

/** "AAAA-MM-DD" (input type=date) válida no calendário. */
export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCFullYear() === Number(m[1]) && date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" (a API recusa datas ISO nos filtros). */
export function brDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** "fulano@gmail.com" → "fu***@gm***.com": mostra o bastante para a pessoa reconhecer o próprio e-mail. */
export function maskEmail(email: string): string {
  const [user, domain = ""] = email.trim().split("@");
  if (!domain) return "***";
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const keep = (part: string, n: number) => `${part.slice(0, Math.min(n, Math.max(1, part.length - 1)))}***`;
  return `${keep(user, 2)}@${keep(host, 2)}${tld}`;
}

/** Mascara todos os e-mails de um texto (mensagens da API na recuperação de acesso). */
export function maskEmailsIn(text: string): string {
  return text.replace(/[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[A-Za-z]{2,}/g, (email) => maskEmail(email));
}

const CPF_PATTERN = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const CNPJ_PATTERN = /^[0-9A-Za-z]{2}\.?[0-9A-Za-z]{3}\.?[0-9A-Za-z]{3}\/?[0-9A-Za-z]{4}-?\d{2}$/;

/**
 * "Usuario" do POST /user/login: CPF/CNPJ válido vai sem pontuação (a API guarda o documento só com dígitos);
 * e-mail e nome de usuário seguem como digitados.
 */
export function normalizeLogin(value: string): string {
  const text = value.trim();
  if ((CPF_PATTERN.test(text) || CNPJ_PATTERN.test(text)) && isValidDocument(text)) return cleanDocument(text);
  return text;
}

/** Caminho de volta depois do login: só caminhos internos (evita redirecionamento aberto). */
export function safeReturnPath(value: string | null | undefined, fallback = "/conta"): string {
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\r\n]/.test(value)) return fallback;
  if (value.startsWith("/api/") || value.startsWith("/conta/entrar")) return fallback;
  return value.slice(0, 300);
}

/** Nome de arquivo seguro para enviar à API (sem caminho nem caracteres de controle). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = Array.from(base)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && !'<>:"|?*'.includes(char))
    .join("")
    .trim();
  return (clean || "arte").slice(-120);
}

/** Data de nascimento plausível (AAAA-MM-DD, entre 1900 e hoje). */
export function isValidBirthDate(value: string, today = new Date()): boolean {
  if (!isValidIsoDate(value)) return false;
  return value >= "1900-01-01" && value <= today.toISOString().slice(0, 10);
}

/** Campos do cadastro (POST /cadastrarcliente), como o formulário guarda. */
export type SignupInput = {
  documento: string;
  /** Nome completo (CPF) ou razão social (CNPJ). */
  nome: string;
  /** Como prefere ser chamado (CPF) ou nome fantasia (CNPJ). */
  apelido: string;
  email: string;
  senha: string;
  confirmacao: string;
  telefone: string;
  nascimento: string;
  inscricaoEstadual: string;
  responsavel: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
};

export type SignupErrors = Partial<Record<keyof SignupInput, string>>;

export const EMPTY_SIGNUP: SignupInput = {
  documento: "",
  nome: "",
  apelido: "",
  email: "",
  senha: "",
  confirmacao: "",
  telefone: "",
  nascimento: "",
  inscricaoEstadual: "",
  responsavel: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

/** Erros por campo (vazio = cadastro aceito). O servidor repete a validação sem a confirmação de senha. */
export function signupErrors(input: SignupInput, { confirmPassword = true } = {}): SignupErrors {
  const errors: SignupErrors = {};
  const kind = documentKind(input.documento);
  const nome = input.nome.trim();
  if (!isValidDocument(input.documento)) errors.documento = "Informe um CPF ou CNPJ válido.";
  if (nome.length < 3) errors.nome = kind === "cnpj" ? "Informe a razão social." : "Informe seu nome completo.";
  else if (kind === "cpf" && !/\S+\s+\S+/.test(nome)) errors.nome = "Informe nome e sobrenome.";
  if (!isValidEmail(input.email)) errors.email = "Informe um e-mail válido.";
  const password = passwordMessage(input.senha);
  if (password) errors.senha = password;
  if (confirmPassword && input.confirmacao !== input.senha) errors.confirmacao = "As senhas não conferem.";
  if (!isValidPhone(input.telefone)) errors.telefone = "Informe o telefone com DDD.";
  if (input.nascimento && !isValidBirthDate(input.nascimento)) errors.nascimento = "Data de nascimento inválida.";
  if (!isValidCep(input.cep)) errors.cep = "Informe um CEP válido.";
  if (input.logradouro.trim().length < 3) errors.logradouro = "Informe a rua.";
  if (!input.numero.trim()) errors.numero = "Informe o número (ou S/N).";
  if (input.bairro.trim().length < 2) errors.bairro = "Informe o bairro.";
  if (input.cidade.trim().length < 2) errors.cidade = "Informe a cidade.";
  if (!isValidUf(input.estado)) errors.estado = "UF inválida.";
  return errors;
}

/** Formatos de arte aceitos no reenvio (impressão). */
export const ART_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tif", "tiff", "ai", "eps", "cdr", "psd", "svg", "zip", "rar"] as const;

export const ART_MAX_MB = 25;

export function artFileProblem(name: string, size: number): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!(ART_EXTENSIONS as readonly string[]).includes(ext)) return `Formato não aceito. Envie ${ART_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.`;
  if (size <= 0) return "O arquivo está vazio.";
  if (size > ART_MAX_MB * 1024 * 1024) return `O arquivo passa de ${ART_MAX_MB} MB. Envie uma versão menor.`;
  return null;
}
