import { apiFailure, fail, isSameOrigin, json, limits, overLimit, sessionOr401 } from "@/lib/api/guard";
import { reenviarArte } from "@/lib/api/padrao";
import { ART_MAX_MB, artFileProblem, safeFileName } from "@/lib/api/validation";

/*
 * POST /api/pedidos/[id]/arte (multipart, campo "arquivo", até 25 MB) → POST /reenviararte.
 * [id] = número do PEDIDO (item da compra no GET /pedidos), quando situacao.reenvia_arte = "Sim".
 * Premissa (o PDF não diz se `arte` é base64 ou URL): o arquivo vai em base64 puro (sem "data:") em `arte`,
 * o nome em `nome` e `url` vazio. Se a Padrão pedir URL, trocar aqui por um upload para storage + `url`.
 * Atenção na hospedagem: plataformas serverless limitam o corpo da requisição (ex.: 4,5 MB na Vercel).
 */

const MAX_BYTES = ART_MAX_MB * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail(403, "Origem não permitida.");
  if (!/^multipart\/form-data\b/i.test(request.headers.get("content-type") ?? "")) return fail(415, "Envie o arquivo pelo formulário.");
  // O navegador sempre informa o tamanho do upload: sem ele (ou acima do limite + folga do multipart) não lê o corpo.
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length) return fail(411, "Envie o arquivo pelo formulário.");
  if (length > MAX_BYTES + 64 * 1024) return fail(413, `O arquivo passa de ${ART_MAX_MB} MB.`);

  const { id } = await params;
  const order = /^\d{1,12}$/.test(id) ? Number(id) : 0;
  if (!order) return fail(400, "Pedido inválido.");
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.art, `arte:${auth.session.id}`);
  if (blocked) return blocked;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("arquivo");
    file = value instanceof File ? value : null;
  } catch {
    return fail(400, "Não foi possível ler o arquivo enviado.");
  }
  if (!file) return fail(400, "Escolha o arquivo da arte.");
  const name = safeFileName(file.name);
  const problem = artFileProblem(name, file.size);
  if (problem) return fail(400, problem);

  const arte = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    await reenviarArte({ idCliente: auth.session.id, idPedido: order, arte, nome: name, url: "" }, auth.session.token);
  } catch (error) {
    return apiFailure(error, { session: true, fallback: "Não foi possível enviar a arte agora. Tente de novo." });
  }
  return json({ ok: true, message: "Arte enviada. A equipe de pré-impressão vai conferir o arquivo." });
}
