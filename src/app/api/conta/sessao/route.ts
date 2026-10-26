import { ApiError } from "@/lib/api/client";
import { json } from "@/lib/api/guard";
import { getCliente } from "@/lib/api/padrao";
import { saldoDaConta } from "@/lib/cliente";
import { clearSession, getSession, publicCustomer, saveSession, withProfile } from "@/lib/session";

/**
 * GET /api/conta/sessao: dados públicos do cliente logado (id, nome, categoria, tabela, revendedor, saldo).
 * Nunca devolve o token. Confere o token no GET /cliente e atualiza categoria/tabela guardadas na sessão.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return json({ status: "anonymous" });

  try {
    const cliente = await getCliente(session.token);
    if (!cliente?.id || Number(cliente.id) !== session.id) {
      await clearSession();
      return json({ status: "anonymous" });
    }
    const updated = withProfile(session, cliente);
    if (updated.changed) await saveSession(updated.session);
    return json(publicCustomer(updated.session, saldoDaConta(cliente.conta_corrente)));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSession();
      return json({ status: "anonymous", session: "expired" });
    }
    // API fora do ar: segue com o que a sessão já sabe (sem saldo).
    return json({ ...publicCustomer(session), stale: true });
  }
}
