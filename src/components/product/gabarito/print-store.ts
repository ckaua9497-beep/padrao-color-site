/*
 * Arquivos de impressão gerados no navegador (PDF no gabarito), guardados no IndexedDB por id — o carrinho
 * (localStorage, ~5 MB) só leva o id. Sobrevivem ao recarregar a página; somem quando a linha sai do
 * carrinho. Sem IndexedDB (navegação privada antiga), as funções falham em silêncio e o pedido segue sem o
 * arquivo pronto (o cliente envia a arte depois, como antes).
 */

const DB_NAME = "padrao-color";
const STORE = "arquivos-impressao";

export type PrintFileMeta = { name: string; product: string; createdAt: number; pages: number; summary: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("sem IndexedDB"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function savePrintFile(id: string, blob: Blob, meta: Omit<PrintFileMeta, "createdAt">): Promise<boolean> {
  try {
    await run("readwrite", (store) => store.put({ blob, meta: { ...meta, createdAt: Date.now() } }, id));
    return true;
  } catch {
    return false;
  }
}

/** Arquivo da arte que o cliente enviou (original), guardado até o checkout mandar para o Bunny. Devolve o id. */
export async function saveArtFile(blob: Blob, name: string, product: string): Promise<string | null> {
  const id = crypto.randomUUID();
  return (await savePrintFile(id, blob, { name, product, pages: 0, summary: "arquivo enviado pelo cliente" })) ? id : null;
}

export async function loadPrintFile(id: string): Promise<{ blob: Blob; meta: PrintFileMeta } | null> {
  try {
    const value = await run<{ blob: Blob; meta: PrintFileMeta } | undefined>("readonly", (store) => store.get(id));
    return value ?? null;
  } catch {
    return null;
  }
}

/** Arquivo recém-gravado fica a salvo da limpeza por este tempo (ele entra no carrinho logo depois). */
const GRACE_MS = 10 * 60_000;

/**
 * Apaga os arquivos que não pertencem mais a nenhuma linha do carrinho (ou a um pedido recente). Os gravados
 * há menos de 10 min ficam: o "Adicionar ao carrinho" grava o PDF antes de criar a linha.
 */
export async function prunePrintFiles(keep: Set<string>): Promise<void> {
  try {
    const db = await open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const request = tx.objectStore(STORE).openCursor();
        const now = Date.now();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const key = cursor.key;
          const created = (cursor.value as { meta?: PrintFileMeta } | undefined)?.meta?.createdAt ?? 0;
          if (typeof key === "string" && !keep.has(key) && now - created > GRACE_MS) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // sem IndexedDB: nada a limpar
  }
}

/** Baixa o arquivo guardado (abre o "salvar como" do navegador). */
export async function downloadPrintFile(id: string): Promise<boolean> {
  const file = await loadPrintFile(id);
  if (!file) return false;
  saveBlob(file.blob, file.meta.name);
  return true;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Arquivos de pedidos já feitos: ficam alguns dias para o cliente baixar de novo (em Meus pedidos) depois que o
// carrinho esvazia.
const KEPT_KEY = "padrao-color-arquivos-pedidos";
const KEPT_DAYS = 14;

/** Arquivo de um pedido recente: id no IndexedDB, nome do PDF, produto, pedido e validade. */
export type KeptPrintFile = { id: string; name: string; product: string; order: number | null; until: number };

/** Arquivos de pedidos recentes ainda guardados neste navegador. */
export function keptPrintFiles(): KeptPrintFile[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEPT_KEY) ?? "[]") as KeptPrintFile[];
    return Array.isArray(list) ? list.filter((k) => typeof k?.id === "string" && k.until > Date.now()) : [];
  } catch {
    return [];
  }
}

/** Guarda os arquivos de um pedido por alguns dias (o carrinho é limpo logo depois). */
export function keepPrintFiles(files: { id: string; name: string; product: string }[], order: number | null) {
  if (!files.length) return;
  try {
    const until = Date.now() + KEPT_DAYS * 86_400_000;
    const ids = files.map((f) => f.id);
    const list = [...keptPrintFiles().filter((k) => !ids.includes(k.id)), ...files.map((f) => ({ ...f, order, until }))];
    window.localStorage.setItem(KEPT_KEY, JSON.stringify(list));
  } catch {
    /* armazenamento indisponível */
  }
}

/** Apaga o que não está no carrinho nem num pedido recente. */
export function prunePrintFilesExcept(cartIds: string[]) {
  void prunePrintFiles(new Set([...cartIds, ...keptPrintFiles().map((k) => k.id)]));
}
