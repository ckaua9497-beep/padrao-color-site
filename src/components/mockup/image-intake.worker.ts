import { processImage, type ProcessOptions, type ProcessResult } from "./image-process";

/*
 * Worker do tratador automático: recebe a imagem já decodificada (ImageBitmap transferido, sem cópia) e faz
 * todo o trabalho de canvas fora da thread principal — a página continua respondendo durante o envio.
 */

type Request = { id: number; bitmap: ImageBitmap; options: ProcessOptions };
type Reply = { id: number; ok: true; result: ProcessResult } | { id: number; ok: false; message: string };

const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (reply: Reply) => void };

scope.onmessage = async (event) => {
  const { id, bitmap, options } = event.data;
  try {
    const result = await processImage(bitmap, bitmap.width, bitmap.height, options);
    scope.postMessage({ id, ok: true, result });
  } catch (error) {
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
