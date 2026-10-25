import "server-only";

import { reenviar } from "./processar";
import { limparArquivosAntigos } from "./repo";

/*
 * Reenvio automático da fila de pedidos (regras.ts): uma volta por minuto, até POR_VOLTA pedidos por volta, um de cada
 * vez (o firewall da Padrão bloqueia rajadas). Para na primeira falta de conexão da volta e respeita o disjuntor do
 * client.ts. Uma vez por dia apaga as imagens guardadas há mais de 180 dias. Liga em src/instrumentation.ts (um por
 * processo do servidor); FILA_PEDIDOS_DESLIGADA=true desliga (o admin ainda envia na mão).
 */

const INTERVALO_MS = 60_000;
const POR_VOLTA = 3;
const DIA_MS = 24 * 60 * 60_000;

type Estado = { timer?: ReturnType<typeof setInterval>; rodando?: boolean; limpezaEm?: number; ultimoErro?: string };
// O dev server recarrega módulos: o globalThis segura um worker só.
const holder = globalThis as typeof globalThis & { __filaPedidos?: Estado };

export function iniciarFila(): void {
  holder.__filaPedidos ??= {};
  const estado = holder.__filaPedidos;
  if (estado.timer || process.env.FILA_PEDIDOS_DESLIGADA === "true") return;
  estado.timer = setInterval(() => void volta(estado), INTERVALO_MS);
  estado.timer.unref?.();
  setTimeout(() => void volta(estado), 15_000).unref?.();
}

async function volta(estado: Estado) {
  if (estado.rodando) return;
  estado.rodando = true;
  try {
    for (let i = 0; i < POR_VOLTA; i += 1) {
      const resultado = await reenviar();
      if (!resultado) break;
      console.log(`[fila] ${resultado.protocolo}: ${resultado.resultado} (${resultado.mensagem})`);
      if (resultado.resultado === "pendente") break;
    }
    if (!estado.limpezaEm || Date.now() - estado.limpezaEm > DIA_MS) {
      estado.limpezaEm = Date.now();
      const apagados = await limparArquivosAntigos();
      if (apagados) console.log(`[fila] ${apagados} imagens antigas apagadas`);
    }
    estado.ultimoErro = undefined;
  } catch (error) {
    // Banco fora do ar (ou sem DATABASE_URL): tenta na próxima volta, avisando no log só quando o erro muda.
    const mensagem = error instanceof Error ? error.message : "erro desconhecido";
    if (mensagem !== estado.ultimoErro) console.error("[fila]", mensagem);
    estado.ultimoErro = mensagem;
  } finally {
    estado.rodando = false;
  }
}
