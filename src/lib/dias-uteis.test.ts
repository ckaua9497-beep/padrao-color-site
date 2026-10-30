import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, brasiliaClock, feriadosDaLista, feriadosNacionais, foraDoExpediente, inicioDaContagem, isoDaApi, nationalHolidays, previsaoAposReenvio } from "./dias-uteis.ts";

const holidays = new Set(nationalHolidays(2026));

test("data de Brasília e dias úteis (fim de semana e feriado nacional)", () => {
  assert.deepEqual(brasiliaClock(new Date("2026-10-09T02:15:00Z")), { iso: "2026-10-08", data: "08/10/2026", hora: "23:15:00" });
  assert.ok(holidays.has("2026-10-12") && holidays.has("2026-04-03"), "N. Sra. Aparecida e Sexta-feira Santa");
  assert.equal(addBusinessDays("2026-10-09", 1, holidays), "2026-10-13", "o exemplo da Padrão: sexta + 1 dia útil, com o feriado na segunda");
  assert.equal(addBusinessDays("2026-10-09", 0, holidays), "2026-10-09");
  assert.ok(feriadosNacionais(2026).has("2027-01-01"), "a reserva cobre a virada do ano");
});

test("expediente de produção: dia útil até as 18h", () => {
  assert.equal(foraDoExpediente({ iso: "2026-10-08", hora: "17:59:59" }, holidays), false, "quinta antes das 18h");
  assert.equal(foraDoExpediente({ iso: "2026-10-08", hora: "18:00:00" }, holidays), true, "quinta às 18h em ponto");
  assert.equal(foraDoExpediente({ iso: "2026-10-08", hora: "07:30:00" }, holidays), false, "dia útil de manhã ainda conta no dia");
  assert.equal(foraDoExpediente({ iso: "2026-10-10", hora: "10:00:00" }, holidays), true, "sábado");
  assert.equal(foraDoExpediente({ iso: "2026-10-12", hora: "10:00:00" }, holidays), true, "feriado");
  assert.equal(inicioDaContagem({ iso: "2026-10-08", hora: "09:00:00" }, holidays), "2026-10-08");
  assert.equal(inicioDaContagem({ iso: "2026-10-08", hora: "19:00:00" }, holidays), "2026-10-09", "depois das 18h: próximo dia útil");
  assert.equal(inicioDaContagem({ iso: "2026-10-09", hora: "18:10:00" }, holidays), "2026-10-13", "sexta à noite pula o fim de semana e o feriado");
  assert.equal(inicioDaContagem({ iso: "2026-10-11", hora: "12:00:00" }, holidays), "2026-10-13", "domingo antes de feriado");
});

test("feriados do GET /feriados: DD/MM/AAAA ou AAAA-MM-DD, linha inválida fica de fora", () => {
  assert.equal(isoDaApi("12/10/2026"), "2026-10-12");
  assert.equal(isoDaApi("2026-10-12 00:00:00"), "2026-10-12");
  assert.equal(isoDaApi("31/02/2026"), null);
  assert.equal(isoDaApi(""), null);
  assert.equal(isoDaApi(undefined), null);
  const lista = feriadosDaLista([{ data: "12/10/2026", descricao: "N. Sra. Aparecida" }, { data: "2026-12-24", descricao: "Recesso" }, { data: "amanhã" }, {}]);
  assert.deepEqual([...lista].sort(), ["2026-10-12", "2026-12-24"]);
  assert.equal(feriadosDaLista(null).size, 0);
});

test("reenvio de arte fora do expediente: previsão + 1 dia útil", () => {
  assert.equal(previsaoAposReenvio("15/10/2026", { iso: "2026-10-08", hora: "17:00:00" }, holidays), null, "antes das 18h a previsão fica");
  assert.equal(previsaoAposReenvio("15/10/2026", { iso: "2026-10-08", hora: "18:05:00" }, holidays), "16/10/2026", "depois das 18h: +1 d.u.");
  assert.equal(previsaoAposReenvio("09/10/2026", { iso: "2026-10-08", hora: "20:00:00" }, holidays), "13/10/2026", "a previsão de sexta pula o fim de semana e o feriado");
  assert.equal(previsaoAposReenvio("15/10/2026", { iso: "2026-10-10", hora: "10:00:00" }, holidays), "16/10/2026", "sábado também conta como fora do expediente");
  assert.equal(previsaoAposReenvio("", { iso: "2026-10-08", hora: "20:00:00" }, holidays), null, "sem previsão não há o que empurrar");
});
