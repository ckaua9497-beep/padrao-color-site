import type { ApiFeriado } from "./api/types";

/*
 * Calendário de produção da Padrão Color (puro, testado):
 * - dia útil = segunda a sexta, fora dos feriados. A lista de feriados vem do GET /feriados (feriados.ts) e pode trazer
 *   dias que não são feriado (recesso, inventário…): o que estiver lá não conta. Sem a API, valem os feriados nacionais.
 * - o dia de produção vai até as 18h (Brasília). Pedido ou arte que chega depois disso, ou num dia não útil, conta como
 *   chegado no próximo dia útil.
 */

/** Hora (Brasília) em que termina o dia de produção. */
export const HORA_LIMITE = 18;

export type Relogio = { iso: string; data: string; hora: string };

/** Data e hora de Brasília (agora, sem `now`): o pedido leva data "DD/MM/AAAA" e hora "HH:MM:SS". */
export function brasiliaClock(now: Date = new Date()): Relogio {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, data: `${parts.day}/${parts.month}/${parts.year}`, hora: `${hour}:${parts.minute}:${parts.second}` };
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

const utcOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
function easter(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/** Feriados nacionais (AAAA-MM-DD): os fixos e a Sexta-feira Santa. Só a reserva de quando o GET /feriados falha. */
export function nationalHolidays(year: number): string[] {
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((day) => `${year}-${day}`);
  return [...fixed, isoDay(easter(year) - 2 * 86_400_000)];
}

/** Feriados nacionais do ano e do seguinte (a previsão de dezembro passa da virada). */
export function feriadosNacionais(year: number): Set<string> {
  return new Set([...nationalHolidays(year), ...nationalHolidays(year + 1)]);
}

export function isBusinessDay(iso: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(utcOf(iso)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(iso);
}

/** AAAA-MM-DD + `days` dias úteis (sem sábado, domingo nem feriado). */
export function addBusinessDays(iso: string, days: number, holidays: ReadonlySet<string>): string {
  let t = utcOf(iso);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    t += 86_400_000;
    if (isBusinessDay(isoDay(t), holidays)) left -= 1;
  }
  return isoDay(t);
}

/** Fora do expediente de produção: dia não útil, ou dia útil a partir das 18h. */
export function foraDoExpediente(clock: Pick<Relogio, "iso" | "hora">, holidays: ReadonlySet<string>): boolean {
  return !isBusinessDay(clock.iso, holidays) || Number(clock.hora.slice(0, 2)) >= HORA_LIMITE;
}

/** Dia em que a produção começa a contar: hoje, num dia útil até as 18h; senão, o próximo dia útil. */
export function inicioDaContagem(clock: Pick<Relogio, "iso" | "hora">, holidays: ReadonlySet<string>): string {
  return foraDoExpediente(clock, holidays) ? addBusinessDays(clock.iso, 1, holidays) : clock.iso;
}

export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "DD/MM/AAAA", "AAAA-MM-DD" ou "AAAA-MM-DD HH:MM:SS" → AAAA-MM-DD (null quando não é uma data válida). */
export function isoDaApi(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const br = /^\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\s*(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (!iso) return null;
  return isoDay(utcOf(iso)) === iso ? iso : null;
}

/** Datas do GET /feriados (AAAA-MM-DD). Linha sem data válida é ignorada. */
export function feriadosDaLista(rows: readonly Partial<ApiFeriado>[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const iso = isoDaApi(row?.data);
    if (iso) out.add(iso);
  }
  return out;
}

/**
 * Previsão depois de um reenvio de arte: a arte que chega fora do expediente (depois das 18h de um dia útil, ou num dia
 * não útil) empurra a previsão em 1 dia útil. null quando a previsão segue a mesma (ou não dá para ler a atual).
 */
export function previsaoAposReenvio(previsao: string | null | undefined, clock: Pick<Relogio, "iso" | "hora">, holidays: ReadonlySet<string>): string | null {
  const atual = isoDaApi(previsao);
  if (!atual || !foraDoExpediente(clock, holidays)) return null;
  return brDate(addBusinessDays(atual, 1, holidays));
}
