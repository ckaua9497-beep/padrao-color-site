/*
 * Simulador local da API da Padrão (só desenvolvimento) para o catálogo em tempo real (src/lib/catalogo-vivo.ts):
 *   GET /grupos                 os grupos do catalog.json, no formato da API (menos os inativos, mais os novos)
 *   GET /produtos?id_grupo=N    as variações do retorno salvo de 23/10 (C:\padraoa\retornos-api\produtos.json)
 *   GET /categorias             as categorias do catalog.json
 *   GET /configuracoes, /tiposnegocio, /acabamentos → []
 *
 *   node scripts/padrao-mock.mjs [--inativos=180,269] [--novo=999001:269] [--preco=269:+10] [--nome="269:Outro nome"]
 *   (porta 3194; ou PADRAO_MOCK_PORT; o retorno salvo em PADRAO_MOCK_DUMP)
 *
 * --inativos  grupos que somem de /grupos (produto inativo)
 * --novo      grupo novo com as variações de outro (id:base), com IDs de variação novos
 * --preco     grupo:percentual a mais (ou a menos) nos preços das variações
 * --nome      grupo:nome novo (o slug muda junto)
 *
 * O estado também muda sem reiniciar: POST /_mock/estado com { inativos, novos, precos, nomes } (GET devolve o atual).
 *
 * No site (.env.development.local): PADRAO_API_URL=http://127.0.0.1:3194, PADRAO_CATALOGO_VIVO=true e, para ver as
 * mudanças na hora, PADRAO_CATALOGO_VIVO_TTL=5 (segundos de cache). Nunca aponte o site de produção para cá.
 * 127.0.0.1, não "localhost": com o simulador desligado, o Node 24 tenta ::1 e 127.0.0.1 ("happy eyeballs") e, com a
 * conexão derrubada no meio, solta um TypeError dentro do AggregateError que deixa a requisição pendurada. O host da
 * API só tem IPv4, então isso não acontece com ela.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PADRAO_MOCK_PORT ?? 3194);
const DUMP = process.env.PADRAO_MOCK_DUMP ?? resolve(root, "../retornos-api/produtos.json");
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

const catalog = JSON.parse(readFileSync(resolve(root, "src/data/catalog.json"), "utf8"));
const dump = JSON.parse(readFileSync(DUMP, "utf8"));
/** Variações por grupo, como a API devolveu em 23/10. */
const rowsByGroup = new Map(dump.retornos.map((r) => [r.id_grupo, r.produtos]));

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const pairs = (raw) => (raw ?? "").split(",").filter(Boolean).map((p) => p.split(":"));

const estado = {
  inativos: (flag("inativos") ?? "").split(",").filter(Boolean).map(Number),
  novos: pairs(flag("novo")).map(([id, base]) => ({ id: Number(id), base: Number(base) })),
  precos: Object.fromEntries(pairs(flag("preco")).map(([id, pct]) => [id, Number(pct)])),
  nomes: Object.fromEntries(pairs(flag("nome")).map(([id, ...nome]) => [id, nome.join(":")])),
};

/** Linha de GET /grupos a partir do produto do catálogo (o caminho inverso do mapGroup). */
function grupoDe(p, id = p.groupId) {
  return {
    id,
    tipo: 1,
    nome: estado.nomes[id] ?? p.name,
    origem: 1,
    id_categoria: String(p.categoryId ?? ""),
    categoria: p.category,
    imagem: p.image,
    gabarito: p.template ?? "",
    meta_title: p.metaTitle ?? p.name,
    meta_description: p.metaDescription ?? "",
    descricao: p.description ?? "",
    tags: (p.tags ?? []).join(","),
    informacao: (p.info ?? []).map((b) => ({ titulo: b.title, texto: b.text })),
    resumo: p.summary ?? "",
    lancamento: p.isNew ? "Sim" : "Não",
    mais_vendido: p.bestSeller ? "Sim" : "Não",
    preco: p.price,
    veja_tambem: (p.related ?? []).map((r) => ({ id: r })),
  };
}

function grupos() {
  const fora = new Set(estado.inativos);
  const lista = catalog.products.filter((p) => p.source !== "site" && !fora.has(p.groupId)).map((p) => grupoDe(p));
  for (const novo of estado.novos) {
    const base = catalog.products.find((p) => p.groupId === novo.base);
    if (base) lista.push({ ...grupoDe(base, novo.id), nome: estado.nomes[novo.id] ?? `${base.name} (novo)` });
  }
  return lista;
}

function produtos(groupId) {
  const novo = estado.novos.find((n) => n.id === groupId);
  const rows = rowsByGroup.get(novo ? novo.base : groupId) ?? [];
  const pct = Number(estado.precos[groupId] ?? 0);
  const k = 1 + pct / 100;
  const preco = (v) => (typeof v === "number" ? Math.round(v * k * 100) / 100 : v);
  return rows.map((row, i) => ({
    ...row,
    ...(novo ? { id: novo.id * 100 + i, grupo: estado.nomes[novo.id] ?? `${row.grupo} (novo)` } : {}),
    ...(pct && row.preco ? { preco: { ...row.preco, economico: preco(row.preco.economico), expresso: preco(row.preco.expresso) } } : {}),
  }));
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/_mock/estado") {
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        Object.assign(estado, JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        return send(res, 400, { erro: "JSON inválido" });
      }
      log("estado:", JSON.stringify(estado));
    }
    return send(res, 200, estado);
  }
  if (req.method !== "GET") return send(res, 405, { ERRO: "Só GET neste simulador" });
  if (!req.headers.authorization) return send(res, 401, { ERRO: "Token ausente" });
  log("GET", url.pathname + url.search);
  if (url.pathname === "/grupos") return send(res, 200, grupos());
  if (url.pathname === "/produtos") {
    const id = Number(url.searchParams.get("id_grupo"));
    const rows = produtos(id);
    return rows.length ? send(res, 200, rows) : send(res, 406, [{ ERRO: "Produto não encontrado!" }]);
  }
  if (url.pathname === "/categorias") return send(res, 200, catalog.categories.map((c) => ({ id: c.id, nome: c.name, imagem: c.image, banner: c.banner ?? "", banner_mobile: c.bannerMobile ?? "", meta_title: c.metaTitle ?? c.name, meta_description: c.metaDescription ?? "" })));
  if (["/configuracoes", "/tiposnegocio", "/acabamentos"].includes(url.pathname)) return send(res, 200, []);
  return send(res, 404, { ERRO: "Rota não simulada" });
}).listen(PORT, () => log(`API da Padrão (simulador) em http://localhost:${PORT} · ${rowsByGroup.size} grupos com variações · estado ${JSON.stringify(estado)}`));
