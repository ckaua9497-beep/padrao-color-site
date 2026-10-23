import type { UploadedArtFile } from "../art-files.ts";

/*
 * Artes dos pedidos da multiloja para a produção: o comprador envia a arte de cada item na página do pedido e ela fica
 * no banco da multiloja (tabela arquivos). Antes do POST /gerarpedido, cada uma sobe para o Bunny (mesma pasta pública
 * das artes do site) e entra em produtos[].arte.anexos, como no checkout do site.
 *
 * Módulo puro (o banco e o Bunny entram por `deps`): testado em artes-producao.test.ts.
 */

export type ItemComArte = { nome: string; arteArquivo: string | null; arteNome: string | null };

export type ArtesDeps = {
  /** Bytes da arte guardada no banco (null quando sumiu). */
  ler: (arquivo: string) => Promise<Uint8Array | null>;
  /** Envio para o Bunny; null com o envio desligado (sem a chave configurada). */
  subir: ((file: { name: string; bytes: ArrayBuffer }) => Promise<{ url: string; nome: string }>) | null;
};

export type ArtesProducao =
  /** `arquivos[i]`: anexos do item i. `pendentes`: itens que vão sem arquivo (sem arte enviada, arte sumida ou envio desligado). */
  | { ok: true; arquivos: UploadedArtFile[][]; pendentes: string[] }
  | { ok: false; message: string };

export async function artesParaProducao(itens: readonly ItemComArte[], deps: ArtesDeps): Promise<ArtesProducao> {
  const arquivos: UploadedArtFile[][] = [];
  const pendentes: string[] = [];
  for (const item of itens) {
    if (!item.arteArquivo || !deps.subir) {
      arquivos.push([]);
      pendentes.push(item.nome);
      continue;
    }
    const bytes = await deps.ler(item.arteArquivo);
    if (!bytes) {
      arquivos.push([]);
      pendentes.push(item.nome);
      continue;
    }
    try {
      // Cópia num ArrayBuffer próprio: o Buffer do banco pode ser uma fatia de um buffer maior.
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const enviado = await deps.subir({ name: item.arteNome || item.arteArquivo, bytes: buffer });
      arquivos.push([{ url: enviado.url, nome: enviado.nome, kind: "arquivo" }]);
    } catch {
      // Sem a arte, a Padrão produziria o pedido sem arquivo: melhor parar e tentar de novo.
      return { ok: false, message: `Não deu para enviar a arte de “${item.nome}” para a Padrão. Tente de novo em instantes.` };
    }
  }
  return { ok: true, arquivos, pendentes };
}
