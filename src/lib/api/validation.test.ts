import { test } from "node:test";
import assert from "node:assert/strict";
import {
  artFileProblem,
  brDate,
  cleanDocument,
  documentKind,
  EMPTY_SIGNUP,
  formatCep,
  formatDocument,
  formatPhone,
  isValidBirthDate,
  isValidCep,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  isValidEmail,
  isValidIsoDate,
  isValidPhone,
  maskDocument,
  maskEmail,
  maskEmailsIn,
  normalizeLogin,
  passwordMessage,
  passwordProblems,
  safeFileName,
  safeReturnPath,
  signupErrors,
} from "./validation.ts";

test("CPF: dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("52998224725"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false, "repetidos");
  assert.equal(isValidCpf("5299822472"), false, "curto");
});

test("CNPJ numérico e alfanumérico (Receita, julho de 2026)", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11222333000181"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00.000.000/0000-00"), false);
  assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true, "exemplo alfanumérico da Receita");
  assert.equal(isValidCnpj("12abc34501de35"), true, "minúsculas");
  assert.equal(isValidCnpj("12.ABC.345/01DE-36"), false);
  assert.equal(isValidCnpj("12.ABC.345/01DE-3A"), false, "dígitos finais são numéricos");
});

test("tipo e máscara do documento", () => {
  assert.equal(documentKind("529.982.247-25"), "cpf");
  assert.equal(documentKind("12.ABC.345/01DE-35"), "cnpj");
  assert.equal(documentKind("123"), null);
  assert.equal(isValidDocument("11.222.333/0001-81"), true);
  assert.equal(isValidDocument("abc"), false);
  assert.equal(cleanDocument("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(formatDocument("52998224725"), "529.982.247-25");
  assert.equal(formatDocument("5299822"), "529.982.2");
  assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatDocument("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(maskDocument("52998224725"), "***.982.247-**");
  assert.equal(maskDocument("11222333000181"), "11.222.333/0001-81");
});

test("e-mail, telefone, CEP e data", () => {
  assert.equal(isValidEmail("cliente@empresa.com.br"), true);
  assert.equal(isValidEmail("cliente@empresa"), false);
  assert.equal(isValidEmail("cli ente@empresa.com"), false);
  assert.equal(isValidPhone("(21) 99999-9999"), true);
  assert.equal(isValidPhone("2136681550"), true);
  assert.equal(isValidPhone("999999"), false);
  assert.equal(formatPhone("21999999999"), "(21) 99999-9999");
  assert.equal(formatPhone("2136681550"), "(21) 3668-1550");
  assert.equal(isValidCep("25520-000"), true);
  assert.equal(formatCep("25520000"), "25520-000");
  assert.equal(isValidIsoDate("2026-02-28"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(brDate("2026-10-06"), "06/10/2026");
});

test("senha nova: mínimo do site", () => {
  assert.deepEqual(passwordProblems("senha123"), []);
  assert.equal(passwordMessage("senha123"), null);
  assert.ok(passwordProblems("abc").includes("pelo menos 8 caracteres"));
  assert.ok(passwordProblems("somenteletras").includes("um número"));
  assert.ok(passwordProblems("12345678").includes("uma letra"));
  assert.ok(passwordProblems("senha 123").includes("sem espaços"));
});

test("máscara de e-mail para a recuperação de acesso", () => {
  assert.equal(maskEmail("fulano@gmail.com"), "fu***@gm***.com");
  assert.equal(maskEmail("a@b.co"), "a***@b***.co");
  assert.equal(maskEmailsIn("Código enviado para fulano@gmail.com."), "Código enviado para fu***@gm***.com.");
  assert.equal(maskEmailsIn("sem e-mail"), "sem e-mail");
});

test("usuário do login: documento válido vai sem pontuação", () => {
  assert.equal(normalizeLogin(" 529.982.247-25 "), "52998224725");
  assert.equal(normalizeLogin("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(normalizeLogin("Cliente@Email.com"), "Cliente@Email.com");
  assert.equal(normalizeLogin("padraocolor"), "padraocolor");
  assert.equal(normalizeLogin("529.982.247-24"), "529.982.247-24", "documento inválido segue como digitado");
});

test("volta depois do login: só caminhos internos", () => {
  assert.equal(safeReturnPath("/conta/pedidos"), "/conta/pedidos");
  assert.equal(safeReturnPath("/checkout"), "/checkout");
  assert.equal(safeReturnPath("https://evil.com"), "/conta");
  assert.equal(safeReturnPath("//evil.com"), "/conta");
  assert.equal(safeReturnPath("/\\evil.com"), "/conta");
  // O parser de URL apaga TAB e quebra de linha: "/\t/evil.com" viraria "//evil.com".
  assert.equal(safeReturnPath("/\t/evil.com"), "/conta");
  assert.equal(safeReturnPath("/\n/evil.com"), "/conta");
  assert.equal(safeReturnPath("/ /evil.com"), "/conta");
  assert.equal(safeReturnPath("/./conta/entrar"), "/conta");
  assert.equal(safeReturnPath("/checkout?passo=2#entrega"), "/checkout?passo=2#entrega");
  assert.equal(safeReturnPath("/api/conta/logout"), "/conta");
  assert.equal(safeReturnPath(null, "/"), "/");
});

test("cadastro: erros por campo", () => {
  const valid = {
    ...EMPTY_SIGNUP,
    documento: "529.982.247-25",
    nome: "Maria da Silva",
    email: "maria@exemplo.com.br",
    senha: "senha123",
    confirmacao: "senha123",
    telefone: "(21) 99999-9999",
    cep: "25520-000",
    logradouro: "Rua Nicolau Cheven",
    numero: "255",
    bairro: "Centro",
    cidade: "São João de Meriti",
    estado: "RJ",
  };
  assert.deepEqual(signupErrors(valid), {});
  assert.deepEqual(Object.keys(signupErrors({ ...valid, nome: "Maria" })), ["nome"], "CPF pede nome e sobrenome");
  assert.deepEqual(signupErrors({ ...valid, documento: "11.222.333/0001-81", nome: "Gráfica" }), {}, "CNPJ aceita razão social de uma palavra");
  assert.deepEqual(Object.keys(signupErrors({ ...valid, confirmacao: "outra123" })), ["confirmacao"]);
  assert.deepEqual(signupErrors({ ...valid, confirmacao: "" }, { confirmPassword: false }), {});
  assert.deepEqual(Object.keys(signupErrors({ ...valid, estado: "XX", nascimento: "2999-01-01" })).sort(), ["estado", "nascimento"]);
  // Data digitada antes de trocar para CNPJ: o campo some e não pode travar o cadastro.
  assert.deepEqual(signupErrors({ ...valid, documento: "11.222.333/0001-81", nome: "Gráfica", nascimento: "0202-01-01" }), {});
  assert.equal(isValidBirthDate("1990-05-20", new Date("2026-10-06")), true);
  assert.equal(isValidBirthDate("1850-05-20", new Date("2026-10-06")), false);
});

test("arquivo da arte: nome seguro, formato e tamanho", () => {
  assert.equal(safeFileName("C:\\Users\\x\\arte final.pdf"), "arte final.pdf");
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName('a<b>:"|?*.png'), "ab.png");
  assert.equal(safeFileName(""), "arte");
  assert.equal(artFileProblem("arte.PDF", 1024), null);
  assert.match(artFileProblem("arte.exe", 1024) ?? "", /Formato/);
  assert.match(artFileProblem("arte.pdf", 26 * 1024 * 1024) ?? "", /25 MB/);
  assert.match(artFileProblem("arte.pdf", 0) ?? "", /vazio/);
});
