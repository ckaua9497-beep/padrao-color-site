import { fail, isSameOrigin, json, limits, overLimit, sessionOr401 } from "@/lib/api/guard";
import { ART_UPLOAD_MAX_MB, uploadProblem } from "@/lib/art-files";
import { BunnyError, bunnyConfig, uploadArtFile } from "@/lib/bunny";

/*
 * POST /api/arte (multipart, campo "arquivo") → Bunny Storage. Usado no checkout: cada arquivo da arte (o enviado pelo
 * cliente e o PDF montado no gabarito) sobe aqui antes do pedido, e a URL pública volta para ir em arte.anexos.
 * Exige a sessão do cliente (o checkout já exige) e conta no limite de envios. Sem Bunny configurado: 503 com
 * `disabled`, e o checkout segue sem os arquivos ("enviar depois").
 * Hospedagem: o corpo chega a 60 MB; plataformas serverless costumam limitar bem menos (4,5 MB na Vercel).
 */

const MAX_BYTES = ART_UPLOAD_MAX_MB * 1024 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Origem não permitida.");
  if (!/^multipart\/form-data\b/i.test(request.headers.get("content-type") ?? "")) return fail(415, "Envie o arquivo pelo formulário.");
  // O navegador sempre informa o tamanho do upload: sem ele (ou acima do limite + folga do multipart) não lê o corpo.
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length) return fail(411, "Envie o arquivo pelo formulário.");
  if (length > MAX_BYTES + 64 * 1024) return fail(413, `O arquivo passa de ${ART_UPLOAD_MAX_MB} MB.`);

  const config = bunnyConfig();
  if (!config) return fail(503, "O envio de arquivos está desligado agora: a arte segue depois do pedido.", { disabled: true });
  const auth = await sessionOr401();
  if (!auth.ok) return auth.response;
  const blocked = overLimit(limits.artUpload, `arte-envio:${auth.session.id}`);
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
  const problem = uploadProblem(file.name, file.size);
  if (problem) return fail(400, problem);

  try {
    return json(await uploadArtFile(config, { name: file.name, bytes: await file.arrayBuffer() }));
  } catch (error) {
    // Nunca loga a chave nem a URL de escrita: só o status do Bunny (ou o tipo do erro de rede).
    console.error("[arte] envio para o Bunny:", error instanceof BunnyError ? `status ${error.status}` : error instanceof Error ? error.name : "erro");
    return fail(502, "Não foi possível guardar o arquivo agora. Tente de novo.");
  }
}
