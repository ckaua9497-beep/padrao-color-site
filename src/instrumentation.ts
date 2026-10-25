/**
 * Subida do servidor: liga o reenvio automático da fila de pedidos do site (src/lib/fila-pedidos/worker.ts). Só no
 * runtime Node e fora do `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { iniciarFila } = await import("./lib/fila-pedidos/worker");
  iniciarFila();
}
