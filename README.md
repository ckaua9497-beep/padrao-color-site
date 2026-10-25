# Padrão Color — loja online

Novo site da **Padrão Color** (gráfica e comunicação visual, São João de Meriti/RJ). É uma loja de impressos e brindes
personalizados em que **todo produto tem um mockup 3D configurável**: o cliente escolhe as opções, envia a arte (imagem ou
texto em um modelo pronto) e vê o produto girando em proporção real antes de colocar no carrinho.

Stack: Next.js 16 (App Router) · React 19 com React Compiler · Tailwind CSS 4 · three.js 0.186 + React Three Fiber 9 + drei 10 ·
TypeScript estrito.

> Esta versão do Next.js tem mudanças incompatíveis com versões antigas. Antes de mexer em APIs do framework, leia o guia em
> `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Como rodar

Requisitos: Node.js 20 ou mais novo (testado no 24) e npm.

```bash
npm install
npm run dev            # http://localhost:3000
```

A configuração de QA do editor (`../.claude/launch.json`, nome `site`) não sobe o servidor: ela se conecta a um servidor já
rodando na **porta 3100**. Para usá-la:

```bash
npm run dev -- -p 3100 # http://localhost:3100
```

## Scripts

| Comando         | O que faz                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `npm run dev`   | Servidor de desenvolvimento com recarga ao vivo. Liga antes o PostgreSQL local da multiloja (sem `DATABASE_URL`). |
| `npm run db`    | Só o PostgreSQL local da multiloja (`.data/postgres`, porta 5433), até Ctrl+C.                     |
| `npm run build` | Build de produção (as páginas de produto e categoria são geradas estaticamente).                   |
| `npm start`     | Serve o build de produção.                                                                         |
| `npm run lint`  | ESLint (`eslint-config-next` + regras do React Compiler). Deve terminar com 0 erros e 0 avisos.    |
| `npm test`      | Testes com `node --test` em `src/**/*.test.ts` (regras de mockup e contraste dos tokens).           |
| `npm run sync:catalog` | Baixa catálogo e vitrine da API Padrão Color para `src/data/` (ver "Catálogo, vitrine e ambiente"). |
| `npm run sync:novos` | Consome a API própria `/api/novos` e grava `src/data/catalog-novos.json` (ver "Produtos novos"). |
| `npm run fotos:novos` | Fotografa os produtos novos (mockup 3D + estampa da marca) em `public/produtos-novos/`. |
| `npm run multiloja:seed` | Cria/recria a loja de demonstração da multiloja no banco local (ver "Multiloja"). |
| `npm run multiloja:admin` | Cria ou troca a senha de um admin da multiloja (senha em `MULTILOJA_ADMIN_SENHA`). |
| `npm run multiloja:migrar-sqlite` | Copia uma vez o banco SQLite antigo (`.data/multiloja.db` + `.data/arquivos`) para o PostgreSQL. |
| `node scripts/frete-mock.mjs` | Simulador local da API de frete da Padrão (porta 3197) para testar a cotação sem a chave (ver "Frete"). |
| `node scripts/bunny-mock.mjs` | Simulador local do Bunny Storage (porta 3196) para testar o envio das artes (ver "Arquivos de arte no Bunny"). |
| `node scripts/pagarme-mock.mjs` | Simulador local da Pagar.me (porta 3195) para testar o Pix da multiloja sem chave (ver "Multiloja"). |

## Dados reais × demonstração

- **Catálogo real.** Produtos, categorias, opções, variações de preço, prazos, fotos e a vitrine vêm da API Padrão Color,
  sincronizados em `src/data/` (ver "Catálogo, vitrine e ambiente"). As fotos são servidas por `img.padraocolor.com.br`
  (liberado em `next.config.ts`).
- **Checkout de demonstração.** Carrinho (guardado no `localStorage` do navegador), CEP e finalização funcionam de ponta a ponta,
  mas **nenhum pagamento é processado** e nenhum pedido chega à gráfica: o checkout mostra "Pedido de demonstração registrado".
- A loja principal não dá desconto no PIX (revisão da Padrão de 25/10/2026). O desconto de 5% (`PIX_DISCOUNT` em `src/lib/pricing.ts`) vale só nas lojas da multiloja, que ligam a linha do PIX com a prop `pix` (`Price`, `ProductExperience`, `CartDrawer`, `CartPageView`).

## Catálogo, vitrine e ambiente

O catálogo e a vitrine vêm da **API Padrão Color** (documentação em `../alteraçoes/DocumentacaoPadraoColor.pdf`). As páginas não
chamam a API: `npm run sync:catalog` grava os dados em `src/data/` e o build gera as páginas a partir deles.

### Variáveis de ambiente (`.env.local`)

Copie `.env.example` para `.env.local` e preencha. Só o servidor do Next lê estas variáveis; o token nunca chega ao navegador.

| Variável                | Para quê                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PADRAO_API_URL`        | Base da API (`https://lab.padraocolor.com/site`; o host lab só responde em HTTPS).                           |
| `PADRAO_API_TOKEN`      | Bearer Token da integração: sincronização do catálogo, cadastro e pedidos de quem ainda não tem token próprio. |
| `PADRAO_SESSION_SECRET` | Segredo (64+ caracteres aleatórios) que assina o cookie de sessão do cliente logado.                        |
| `PADRAO_ORDERS_ENABLED` | `true` envia o pedido de verdade (`POST /gerarpedido`); qualquer outro valor deixa o checkout em simulação (padrão). |
| `PADRAO_SITE_ORIGINS`   | Opcional. Origens extras aceitas nos POST, separadas por vírgula (proxy que troca o Host).                  |
| `BUNNY_ACCESS_KEY`, `BUNNY_STORAGE_URL`, `BUNNY_CDN_URL`, `BUNNY_UPLOAD_FOLDER` | Bunny Storage dos arquivos de arte (ver "Arquivos de arte no Bunny"). Sem a chave, o checkout segue sem os arquivos. |
| `PADRAO_FRETE_URL`, `PADRAO_FRETE_API_KEY` | API de frete da Padrão (ver "Frete"). Sem a chave não há cotação: a página de produto mostra só a cidade e cada loja da multiloja cobra o frete fixo dela. |

Variáveis novas das outras frentes (conta, pedidos, pagamento) ficam descritas no próprio `.env.example`.

### Arquivos de arte no Bunny e o pedido

- **Fluxo.** O cliente monta ou envia a arte no site; ao adicionar ao carrinho, os arquivos ficam no navegador (IndexedDB,
  `print-store.ts`): o PDF no gabarito (`printFile`) e os arquivos que ele enviou, frente e verso (`artFiles`, o original antes
  do corte de margem e da remoção de fundo; AI, CDR e PDF como vieram). O logo de um kit é guardado uma vez para todos os itens.
  No checkout, antes do pedido, cada arquivo sobe por `POST /api/arte` (multipart, com a sessão do cliente) e o servidor grava
  no Bunny: `PUT {BUNNY_STORAGE_URL}/{pasta}/{nome}` com a `AccessKey`, que nunca vai ao navegador. O nome é o do cliente limpo
  (sem acento, espaço nem símbolo) mais o momento do envio em ms (`Banner80x120teste1791545356518.jpg`, `src/lib/art-files.ts`).
  A URL pública (`{BUNNY_CDN_URL}/{pasta}/{nome}`) fica guardada na linha do carrinho (não sobe de novo se o pedido falhar) e vai
  no pedido em `produtos[].arte.anexos` com o `tipoArquivo` que a variação aceita na API (`tipos_anexo`: "Arquivo Único",
  "Impressão Frente", "Impressão Verso"…). O servidor só aceita URLs da pasta pública e com nome gerado aqui.
- **Customização por variação (`src/lib/customizacao.ts`).** Cada variação tem o seu perfil (`Product.customizacoes`, índice
  em `Variation.cz`): modo da arte (arquivo, sem personalização, neon frase/modelo/logo), anexos aceitos, preço da criação de
  arte e web2print, com as regras do site por cima da API (sem personalização e neon pronto não pedem arte nem levam anexo;
  personalizado sem `tipos_anexo` aceita "Arquivo Único"; nome ou opção "Sem Impressão"/"Produto sem Personalização" = sem
  personalização; web2print só com template). Na página do produto, os anexos além da arte (faca de corte, máscara de
  branco, verniz, capa, miolo, posição do LED) viram "Arquivos complementares" opcionais, enviados como `kind: "extra"` com
  o `tipo` e mandados no pedido com esse `tipoArquivo`. A variação sem personalização (produto liso, neon pronto) mostra só
  as fotos, sem o 3D nem o "Pré-visualizar" (revisão da Padrão de 25/10/2026): a peça é vendida como na foto.
- **Pedido (`POST /gerarpedido`).** Os produtos seguem o exemplo de pedido da Padrão (`src/lib/orders.ts`): `id` (variação),
  `groupId`, `groupCategoryId`, `productName`, `productImage`, `productType`, `quantidade` (lotes), `price` (um lote),
  `precoTotal`, `variations` (opções da variação), `package` (embalagem da variação), `tipoProducao`, `productionTime`,
  `nomeTrabalho`/`nome_trabalho`, `desc_trabalho` (a linha da arte e o que o site acrescenta: texto, kit, tamanhos, medida),
  `arte {tipo, preco, anexos}`, `tratamentoArquivo` e `precoTotalAcabamentos`; no envelope, `data`, `hora` (Brasília), `previsao`
  (o maior prazo em dias úteis, sem fim de semana nem feriado nacional), `idCliente`, `pagamento {tipo, valor, status}`,
  `entrega`, `tipo_compra`, `nome_trabalho` e `precoTotal`. As premissas ainda abertas estão no comentário do arquivo.
- **Reenvio de arte** (Meus pedidos, `POST /api/pedidos/[id]/arte`): com o Bunny, o arquivo sobe para lá e o `/reenviararte`
  leva `url` e `nome`; sem ele, o arquivo vai em base64, como antes.
- **Teste local:** `node scripts/bunny-mock.mjs` (porta 3196, grava em `.data/bunny-mock/`) e, no `.env.development.local`,
  `BUNNY_ACCESS_KEY=teste`, `BUNNY_STORAGE_URL=http://localhost:3196/padraocolor`, `BUNNY_CDN_URL=http://localhost:3196/cdn`.
- **Hospedagem:** o envio aceita até 60 MB por arquivo; plataformas serverless limitam o corpo bem abaixo disso (4,5 MB na
  Vercel). Num servidor próprio (VPS + Cloudflare Tunnel), sem limite extra.

### Fila de pedidos do site (`src/lib/fila-pedidos/`)

Quando o pedido não chega à produção pelo `POST /gerarpedido`, o site guarda o pedido e as artes em vez de dar erro.

- **Quando entra na fila.** Sem conexão com a API (no `GET /cliente`, nos preços ou no próprio `gerarpedido`: API fora do ar,
  firewall, disjuntor do `client.ts`) → **aguardando reenvio**, com o token do cliente selado (chave derivada do
  `PADRAO_SESSION_SECRET`) para refazer cliente e preços. Resposta sem confirmação (5xx, conexão caída depois de enviar) →
  **conferir**: pode ter sido criado, então nada é reenviado sozinho. Recusa da API (4xx) volta para o cliente corrigir, como
  antes. Regras puras em `regras.ts` (testadas); fechamento compartilhado entre o checkout e a fila em `processar.ts`.
- **O que o cliente vê.** "Pedido recebido · Protocolo PF-00001" (o carrinho é limpo, nada é cobrado) e, em Meus pedidos, a
  lista "Pedidos recebidos pelo site" com a situação e o número da Padrão quando sai.
- **Artes.** Sem Bunny (ou com ele fora), `/api/arte` guarda o arquivo no banco (`arquivos`, dono `fila/<cliente>`) e a URL é do
  próprio site: `{MULTILOJA_URL_PUBLICA}/api/pedidos/arquivo/<nome>` (sempre baixa como anexo). Antes de reenviar, a fila sobe
  esses arquivos para o Bunny se ele voltou. Ficam 180 dias.
- **Reenvio automático.** `worker.ts`, ligado em `src/instrumentation.ts`: uma volta por minuto, até 3 pedidos, um de cada vez,
  parando na primeira falta de conexão; espera de 1, 2, 5, 10, 20, 30 e depois 60 minutos; com 72 tentativas vai para conferir.
  `FILA_PEDIDOS_DESLIGADA=true` desliga (o admin ainda envia na mão).
- **Admin** (`/admin/fila-pedidos`, "Fila do site" no menu): situação, motivo, último erro, artes para baixar, histórico e JSON;
  ações "Enviar agora" ("Conferi: enviar agora"), "Marcar como enviado" com o número do pedido, "Devolver ao reenvio automático"
  e "Cancelar". Banco: tabela `pedidos_fila` (migração 5).

### Termos de envio de arte (`src/lib/termos-arte.ts`)

Todo produto personalizado pede "Li e aceito os termos de envio de arte" no passo "Sua arte" antes de ir para o carrinho
(`TermosArte.tsx`, com os termos para ler). O aceite (versão + data) vai na linha do carrinho e no pedido (`desc_trabalho`).
Item que chega ao checkout sem o aceite (carrinho antigo, kit, festa, fachada) pede o aceite lá. O `/api/pedidos` recusa item
personalizado sem aceite. O texto é provisório, para a Padrão validar; mudar o texto pede uma `TERMOS_ARTE_VERSAO` nova.

### Frete (API de frete da Padrão)

- **Quem calcula.** A Padrão já cota no Melhor Envio com a conta, o CEP de despacho e as regras dela; o site não fala com o
  Melhor Envio. Ele chama `POST {PADRAO_FRETE_URL}` (padrão `https://padraocolor.com.br/api/v2/melhor-envio/freight/calculate`)
  com o cabeçalho `x-api-key: PADRAO_FRETE_API_KEY`, só no servidor (`src/lib/frete-api.ts`; a chave nunca vai ao navegador nem ao
  log; cotações iguais ficam 10 minutos em memória).
- **O que vai.** `{ to: { postal_code }, products: [{ id, width, height, length, weight, insurance_value, quantity }] }`: um
  produto por item, com a embalagem que a Padrão cadastra na variação (`embalagem` de `GET /produtos` → `em` no catálogo: peso em
  kg, largura, altura e comprimento em cm, lotes por caixa). `quantity` é o número de volumes, ⌈lotes ÷ lotes por caixa⌉ (1.000
  cartões num volume = 1); `insurance_value` vai 0. Variação sem embalagem usa a mais pesada do mesmo produto ("estimado"); produto
  sem nenhuma não é cotado. A resposta (`services[]` com `price`, `deliveryTime`, `deliveryRange`, `company`) vira a lista de formas
  de entrega, mais barata primeiro; os `unavailable` ficam de fora. Regras puras e testadas em `src/lib/frete.ts`.
- **Onde aparece.** "Calcular entrega" na página de produto (`POST /api/frete {cep, groupId, variationId, quantity}`; a embalagem
  sai do catálogo no servidor; 40 consultas a cada 10 minutos por IP): a cidade (ViaCEP) e as formas de entrega com preço e prazo
  de transporte, contado depois que o pedido fica pronto. É uma estimativa: no checkout do site o frete ainda é combinado com o
  atendimento, porque o contrato do `gerarpedido` não tem campo de frete. Nas lojas da multiloja o checkout cota e cobra (ver
  "Multiloja").
- **Teste local:** `node scripts/frete-mock.mjs` (porta 3197, mesmo formato de resposta, preços inventados com peso cubado e
  distância pelo CEP) e, no `.env.development.local`, `PADRAO_FRETE_URL=http://localhost:3197/api/v2/melhor-envio/freight/calculate`
  e `PADRAO_FRETE_API_KEY=teste`.

### Imagens e banners do site (admin → Site)

A Padrão troca no próprio painel (`/admin`, grupo "Site Padrão Color") as imagens que o site mostra, mesmo quando a API
manda outras, e os banners da página inicial. Sem troca, valem as imagens padrão do site e, onde não há padrão, as da API.

**Imagens padrão (Figma "LOJA ONLINE - PADRAOCOLOR"):** ficam em `public/site/` e em `src/lib/midia-padrao.ts`:
- fotos de estúdio de 23 produtos (600 × 804, fundo cinza; `produtos/<id do catálogo>.webp`);
- as fotos redondas das 5 categorias da página inicial;
- os 5 banners do carrossel (2560 × 800 e 2160 × 2700 no celular: os do Figma, de 1280 × 400 e 1080 × 1350, ampliados 2×
  com super-resolução Real-ESRGAN, como as categorias, de 800 × 800, e o contorno laranja da faixa escura);
- o banner largo "Cartões de visita e postais".

`comPadrao` (`src/lib/midia.ts`) põe por cima o que o admin salvou: produto por produto, categoria campo a campo e a lista
de banners de um lugar quando ela existe. No admin, o que ainda é padrão aparece marcado como "Padrão do site", e "Voltar
ao padrão do site" apaga o registro salvo. O pedido continua levando a foto do catálogo.

- **Imagens → Produtos** (`/admin/site/imagens`): busca, filtro por categoria e "só trocados". Para cada produto: enviar
  fotos (arrastar e soltar, várias de uma vez), ordenar arrastando (a primeira é a capa dos cards, da busca e do carrinho),
  reaproveitar fotos da API ("Usar") e, se quiser, "mostrar também as fotos da API depois das minhas". Prévia do card e da
  galeria; cada produto guarda o seu rascunho até salvar.
- **Imagens → Categorias** (`?aba=categorias`): a imagem da categoria (menu e "Categorias" da página inicial) e um banner do
  topo da página da categoria, no computador (1440 × 355 px) e no celular. Sem banner próprio, a categoria mostra o topo
  ilustrado com os produtos (o banner da API não aparece, como antes).
- **Banners** (`/admin/site/banners`):
  - "Carrossel do topo" (1920 × 600 px recomendado no computador, 1080 × 1350 no celular, até 8): passa sozinho a cada 5 s,
    tem setas (com o mouse em cima ou foco), bolinhas e botão de pausa, arrasta no celular e para com o mouse em cima ou
    "reduzir movimento". Sem lista salva valem os 5 banners padrão; com todos desligados, a página inicial fica sem carrossel.
  - "Faixas promocionais" (até 9, depois de "Mais vendidos"): cada faixa tem a sua linha; as da mesma linha ficam lado a
    lado com a mesma altura, na proporção de cada imagem (como os "botões" do padraocolor.com.br).
  - Cada banner: imagem do computador e (opcional) do celular, texto alternativo (obrigatório), link (caminho do site ou
    https), nova aba, ligado/desligado e período no ar (dia de Brasília). Ordem por arrastar ou ↑ ↓. Prévia ao vivo no
    computador e no celular. "Trazer os banners/botões do site atual" copia os da vitrine da API como ponto de partida.
- **Envio:** cada imagem vai por Server Action (até 6 MB; banner 7 MB), com o tipo lido dos bytes (PNG, JPG ou WebP) e o
  tamanho lido do cabeçalho (`dimensoesImagem`), para o site reservar o espaço certo. Fica no banco (`arquivos`, dono
  "site") e é servida por `GET /api/site/imagem/<nome>` com cache de um ano (o nome muda a cada envio). As que nenhum
  registro usa são apagadas depois de 7 dias.
- **Dados:** tabela `site_midia` (migração 4), um registro por chave: `produto/<id do catálogo>`, `categoria/<slug>`,
  `banners/<lugar>`. Regras puras e testadas em `src/lib/midia.ts` (aplicar no catálogo, validar o que vem do admin,
  período no ar, linhas das faixas, tamanho da imagem); banco e cache em `src/lib/midia-servidor.ts`; ações em
  `app/(admin)/admin/site-actions.ts`; telas em `components/admin/site/`; banners da loja em `components/home/`.
- **Onde vale:** página inicial (topo, faixas, categorias, vitrines), categoria, todos os produtos, produto (galeria e
  dados do Google), menu, busca do topo (`/produtos/indice.json`), Crie Sua Festa, Monte Seu Kit, Para o seu negócio,
  gabaritos e as lojas da multiloja. O pedido para a Padrão continua com a foto da API.
- **Atualização:** as páginas continuam geradas no build. Elas leem as trocas por `midiaDoSite()` (cache do Next com a
  etiqueta `site-midia`); salvar no admin chama `updateTag` e cada página se refaz no próximo acesso (testado com
  `next build` + `next start`). A página inicial também se refaz a cada 10 minutos, para o período dos banners. Sem banco
  no build, as páginas saem com as imagens da API e se corrigem na primeira troca ou em até um dia. Com mais de um
  servidor, o cache do Next precisa ser compartilhado.

### Sincronizar o catálogo

```bash
npm run sync:catalog   # ~60 s, só faz GET na API (usa PADRAO_API_URL e PADRAO_API_TOKEN do .env.local)
npm test               # tipos de mockup, preços (m², expresso, grade) e tokens
```

`scripts/sync-catalog.mjs` lê `GET /categorias`, `/grupos`, `/produtos?id_grupo=…` (sem filtro essa rota estoura o gateway),
`/configuracoes`, `/tiposnegocio` e `/acabamentos`, e grava:

| Arquivo                        | Conteúdo                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/catalog.json`        | Categorias (banner, banner de celular e SEO) e produtos. Produto = grupo da API (uma página, slug igual ao do site oficial); variação = produto da API (ID que vai no pedido, preço e prazo econômico/expresso, quantidade, faixa de quantidade `mn`/`mx` quando a variação tem a sua (Caderno "De 11 até 100" = 11 a 100 unidades) e embalagem `em`: peso em kg, largura, altura e comprimento em cm e lotes por caixa, para o frete; `ei` quando a Padrão cadastrou só parte dela). Traz resumo, descrição, blocos de informação, gabarito, tags, SEO, "veja também", grade de tamanhos, tabela de medidas, medida livre (m²), criação de arte, anexos e quantidade mínima/máxima. As grafias repetidas de uma opção ("250gr"/"250g", maiúsculas, "1008"/"1008 unidades") viram uma só (`normalizeOptionValues`, src/lib/catalog-map.ts). |
| `src/data/storefront.json`     | A vitrine do padraocolor.com.br: banners (desktop e celular, com a medida real das artes), botões das linhas 1 e 2, categorias em destaque, "Nossos Destaques", mais vendidos, menu oficial, texto e faixa do topo. Links do site oficial viram rotas locais (`/produto/…`, `/categoria/…`).                                                                       |
| `src/data/business-types.json` | "Para o seu negócio": tipos de negócio com banner, SEO e grupos (páginas `/negocios/[slug]`).                                                                                                                                                                                                                                                                    |
| `src/data/finishes.json`       | Acabamentos (`GET /acabamentos`).                                                                                                                                                                                                                                                                                                                                |

Depois de sincronizar, rode `npm test`: o teste de contagem por tipo de mockup (`src/lib/mockup.test.ts`) acusa produtos novos que
caíram em outro tipo, e o teste de overrides acusa slugs que sumiram.

### Catálogo em tempo real

Pedido da revisão da Padrão de 25/10/2026: ativo/inativo, descrição, configuração e valores vindos da API. Liga com
`PADRAO_CATALOGO_VIVO=true`, depois de liberar o IP do servidor no firewall da Padrão. Desligado, e sempre no `next build`,
vale o `catalog.json` do sync, como antes.

- **Ativo = está em `GET /grupos`.** A API não tem campo de status. O `/consultarstatusproduto` respondeu 406 para uma
  variação em 25/10 e está nas perguntas à Padrão. O grupo que sai de lá some das listagens, do menu, da busca, dos
  preços e das lojas da multiloja. A página dele:
  - leva ao grupo em que ele foi juntado (`GRUPOS_JUNTADOS`), se houver;
  - senão, dá 404.
- **De onde vem cada dado** (`src/lib/catalogo-vivo.ts`, só no servidor):
  - **Nome, textos, categoria, imagem e marcas:** de `/grupos`, com cache de 10 min.
  - **Variações, preços e prazos:** de `/produtos?id_grupo=`, com o mesmo `mapGroup` do sync. A página do produto, o preço
    do carrinho (`/api/precos`) e o pedido usam dados de até 10 min.
  - **Listagens e cards:** usam o que está no cache e renovam em segundo plano o que passou de 30 min, 2 grupos por vez.
    Assim o processo nunca dispara centenas de consultas de uma vez.
- **Quando a API falha:** fica o último dado bom; sem nenhum, o do sync.
- **Nome que mudou na API:** o slug muda junto, e o link antigo redireciona para o novo.
- **Grupo novo** (em `/grupos` e fora do sync): a página abre pelo ID no começo do slug e o produto entra nas listagens quando
  as variações dele chegam. Sem regra de 3D (tipo "fallback"), mostra só as fotos.
- **Regras puras e testadas:** `src/lib/catalogo-grupos.ts` (`montarCatalogo`, `aplicarGrupo`, `categoriasDoCatalogo`).
- **`catalogView`:** o `catalog.ts` virou uma fábrica de consultas sobre qualquer catálogo. As exportações síncronas são as do
  sync, e `await catalogoVivo()` devolve as mesmas funções sobre o catálogo vivo. Páginas da loja, rotas de preço, pedido,
  frete, kit e gabarito e a multiloja (`lojaItens`, `vendas.ts`) usam o vivo.
- **Atualização das páginas:** as páginas da loja têm `revalidate = 600`, e a de produto também `dynamicParams`.
- **Simulador:** `node scripts/padrao-mock.mjs` (ou "padrao-mock" no `.claude/launch.json`, porta 3194) serve `/grupos` e
  `/produtos` a partir do catálogo e do retorno salvo de 23/10. Para testar, ponha no `.env.development.local`:
  - `PADRAO_API_URL=http://127.0.0.1:3194`
  - `PADRAO_CATALOGO_VIVO=true`
  - `PADRAO_CATALOGO_VIVO_TTL=5`

  O estado muda sem reiniciar, com `POST /_mock/estado`:
  - `{"inativos":[41]}` deixa um grupo inativo;
  - `{"novos":[{"id":999001,"base":269}]}` cria um grupo novo;
  - `{"precos":{"269":10}}` sobe o preço;
  - `{"nomes":{"180":"…"}}` troca o nome.

  Conferido em 25/10: inativo dá 404 e some da categoria e da busca; o grupo novo abre e entra na listagem; o preço novo vale
  na página e no `/api/precos`; o slug antigo redireciona; com o simulador desligado, tudo responde com o último dado.

### Produtos novos (API própria)

Produtos que a Padrão Color ainda não tem na API dela (embalagens, sacolas, lacres, totem, cartela, identificador de
porta…) vêm de uma API do próprio site, **no mesmo formato da API da Padrão**, e entram no catálogo pelo mesmo caminho:

```bash
npm run dev              # a API própria roda dentro do site
npm run sync:novos       # GET /api/novos/categorias, /grupos e /produtos?id_grupo=… → src/data/catalog-novos.json
npm run fotos:novos      # fotos de catálogo (precisa do Google Chrome e do site no ar)
npm test
```

- **Fonte:** `src/data/novos/fonte.json` (`categorias`, `grupos` e `produtos` no formato de `GET /categorias`, `/grupos` e
  `/produtos` da Padrão). Cada grupo traz também `parametros`: **todos** os atributos e valores do produto (inclusive os que
  ainda não têm preço, em `disponivelSobConsulta`), regras de combinação, quantidade mínima/máxima/múltiplo e faixas,
  serviços de arte, medidas, material, impressão e a base do prazo estimado. `meta.ajustePreco` multiplica todos os preços.
- **API (`src/app/api/novos/[[...recurso]]/route.ts`, lógica em `src/lib/novos-api.ts`):**
  - `GET /api/novos` — índice com todos os produtos, opções, parâmetros e o link das variações;
  - `GET /api/novos/categorias` (`id`, `categoria`, `grupo`), `/grupos` (`id`, `categoria`, `grupo`, `tag`) e `/produtos`
    (`id_produto`, `id_grupo`, `id_categoria`, `categoria`, `grupo`): os mesmos filtros da Padrão; sem registros, 204;
  - em `/produtos`, qualquer opção da variação também filtra: `?id_grupo=900006&Alca=fita&Cor=preta&Quantidade=100`;
  - pública e só de leitura, com CORS; com `NOVOS_API_TOKEN` definido, exige `Authorization: Bearer <token>`.
- **IDs reservados**, que nunca podem bater com os da Padrão: categoria `900000`, grupos `900001+`, variações `9000001+`.
  `src/lib/catalog-merge.ts` derruba o build se um slug, grupo ou ID de variação colidir com o `catalog.json`.
- **Sincronização:** `scripts/sync-novos.mjs` usa o mesmo mapeamento do `sync-catalog.mjs` (`src/lib/catalog-map.ts`).
  `NOVOS_API_URL` aponta para outro endereço (padrão `http://localhost:3100/api/novos`); `--local` lê a fonte sem servidor.
- **Fora do site desde 25/10/2026.** A revisão da Padrão ("Observações Site Novo") pede que o site mostre só produtos da API
  dela, então `PRODUTOS_NOVOS_NO_SITE` (`src/lib/catalog.ts`) está `false`: sem a categoria "Produtos Novos", sem a aba do menu
  e sem as páginas de produto. A fonte, a API própria, os modelos 3D e as fotos continuam no projeto, e as páginas internas de
  QA (`/design-system/mockups`, `/design-system/fotos`, `fotos:novos`) seguem vendo esses produtos (`getQaProducts`).
- **Ligado (`true`):** categoria "Produtos Novos" (`/categoria/produtos-novos`), aba na 2ª linha do menu (volta em `EXTRA_TABS`)
  e logo depois das categorias em destaque na home. O produto leva `source: "site"`: sem tabela de revenda (não existe na API da Padrão), e com o pedido real
  ligado o item volta do checkout com o aviso de fechar pelo atendimento, porque o ID dele não existe no `gerarpedido`. Quando a
  Padrão cadastrar o produto, ele sai da fonte e passa a vir pelo `sync:catalog`.
- **Preços e prazos** são valores de referência a validar pela Padrão; a fonte marca isso em `parametros.precos` e
  `parametros.prazo`.
- **Fotos:** `scripts/fotos-produtos.mjs` abre `/design-system/fotos?p=<slug>&cor=<token>&modo=pattern|mark&giro=…&op=Chave:Valor`,
  que renderiza o mockup 3D com a estampa da marca (`src/components/mockup/brand-art.ts`: fundo chapado no espectro do logo,
  contornos brancos e as peças do símbolo; `mark` é a versão de 1 cor para serigrafia) e captura sem fundo
  (`CaptureFn({ transparent: true })`), recortada e centralizada num quadrado WebP de 1200 px (o dobro das fotos de 600 px do site oficial; `-- --tam=` muda).

### Rotas de dados

- **`/produtos/indice.json`** — índice leve da busca do topo, gerado do catálogo no build (substitui o antigo
  `public/search-index.json`).
- **`/api/kit/produto?slug=`** — um produto do catálogo no formato do Monte o seu kit (variações com preço, opções e faixas),
  para o produto que o cliente acha na busca do assistente entrar no kit com o valor certo. 400 sem slug, 404 se não existe.
- **`/api/gabarito/[id]`** — download do gabarito de um produto (`id` do catálogo, ex. `35` ou `tags`, ou o slug). Premissa: o
  "PG Gabarito" do checklist não tem contrato e nenhum endpoint do PDF baixa gabarito; o arquivo vem do campo `gabarito` de
  `GET /grupos`, a mesma URL usada em padraocolor.com.br/gabaritos. A rota só busca em `https://img.padraocolor.com.br/padraocolor/…`,
  repassa o arquivo em streaming com `Content-Disposition: attachment; filename="gabarito-<slug>.<ext>"` e o tipo certo (zip, rar,
  pdf) e responde 404 quando o produto não tem gabarito. A página `/gabaritos` lista todos, com busca e filtro por categoria.

### Imagem enviada: tratador automático

Toda imagem que o cliente envia para a arte passa por um tratador antes de chegar ao 3D, ao editor e ao arquivo de
impressão (`src/components/mockup/image-intake.ts`, decisões puras e testadas em `src/lib/image-prep.ts`):

- **Abrir sem travar a página:** `createImageBitmap` decodifica fora da thread principal, já em pé pelo EXIF, e todo o
  trabalho de canvas roda num Worker (`image-intake.worker.ts` + `image-process.ts`, OffscreenCanvas; sem suporte, os
  mesmos passos na página). SVG é rasterizado no tamanho da prévia a partir do `viewBox` e conta como vetor (sem aviso de
  dpi; o SVG de impressão usa o mesmo `viewBox` da prévia). HEIC abre onde o navegador sabe; TIFF, AI e CDR vão anexados
  com uma mensagem clara (no verso, que não tem anexo, a mensagem pede outro formato).
- **Arquivo feito no gabarito** (folha, sangria ou tamanho final, pelos pixels do original): entra como veio, sem corte
  nem remoção de fundo.
- **Ler a imagem:** uma amostra de 256 px diz se é foto ou arte/logo, se tem transparência (pelos pixels, não pelo
  formato: GIF e SVG transparentes não ganham mais fundo preto), a cor da borda (faixa de 3%; com um filete de moldura,
  vale o anel de dentro) e o centro de interesse. Borda lisa sozinha não faz arte: foto de estúdio em fundo branco tem
  luz variando aos poucos (`softShading`) e continua foto.
- **Arrumar:** corta a margem vazia (branca, de cor chapada ou transparente), medida numa cópia de 1024 px com tolerância
  apertada para traço fino e tagline clara não sumirem; em camisa e sacola plástica/kraft tira o fundo branco ligado à
  borda (o branco de dentro do logo fica). A prévia (até ~4 MP, dentro do teto de canvas do aparelho) vai numa URL
  `blob:`; o arquivo de impressão é o original, ou o original tratado em resolução cheia (reduzido ao teto do canvas no
  iPhone), ou o SVG. "Usar a imagem original" reenvia o arquivo sem corte nem remoção de fundo.
- **Encaixar na peça** (`autoFit`): foto preenche a área centrada no assunto quando o corte é de até 45%; senão entra
  inteira com o fundo da cor da borda. Logo/arte fica inteiro, centralizado, com respiro, no maior tamanho que imprime
  nítido para o tamanho da peça (`dpiTargets`: 150 em peças pequenas, 100 em banners, 50 em lonas, com 2% de folga),
  sobre a cor da borda dele quando a imagem é opaca; em caneca, copo e garrafa, dentro da parte que fica de frente (com
  ou sem gabarito) quando a faixa dá a volta na peça (largura ÷ altura de 1,6 para cima); num adesivo de frente, como o DTF
  U.V. de 7 × 10 cm da garrafa de alumínio, o logo usa a área toda. Sem gabarito: `src/components/product/auto-fit.ts` (refaz o encaixe ao trocar de formato; botões
  "Preencher a área" / "Imagem inteira"; "Voltar ao encaixe automático" no editor). No gabarito: `fitToTemplate`. O fundo
  que o tratador põe volta ao do cliente quando entra outra imagem.
- **Mostrar nítido:** a textura do 3D com imagem tem 2048 px (1536 no celular) e filtragem anisotrópica máxima; durante o
  arraste no editor 2D ela cai para 1024 px e volta ao soltar.
- O cliente vê o que foi feito abaixo do nome do arquivo ("Ajustada automaticamente: margens vazias cortadas · inteira e
  centralizada · no maior tamanho que imprime nítido").

### Gabaritos: medidas reais e encaixe da arte

O site conhece as medidas de todos os gabaritos oficiais (243 produtos, 228 arquivos) e encaixa a arte enviada neles.

- **`npm run sync:templates`** (`scripts/sync-templates.mjs`, rode depois do `sync:catalog`) baixa cada gabarito do campo
  `template` do catálogo para `.cache/gabaritos/` (fora do git, ~10 GB; `--refresh` baixa de novo), abre ZIP/RAR, lê os PDFs (o
  `.ai` só quando a pasta não tem PDF; CDR/PSD não são lidos) com o MuPDF num worker por arquivo e grava
  `src/data/templates.json`. A leitura fica em `.cache/gabaritos/_lido/`, então rodar de novo só para aplicar a curadoria leva
  segundos. `--only=269,466` atualiza só esses produtos; `--debug=<pasta>` salva uma prévia PNG de cada página e o `raw.json`.
- **Convenção de cores** dos gabaritos da Padrão (folha "Orientações de Envio"): ciano = sangria, preto = corte, laranja =
  área de segurança, verde = costura, magenta/vermelho = marcas (bolso, logo, zíper), cinza = dobra. Cada página do PDF vira uma
  **folha** com um ou mais **painéis** (sangria, corte com forma e caminho SVG em mm, segurança, costura, marcas, furos). Peças
  contínuas com dobra que atravessa a peça (almofada e bolsa com frente e verso no mesmo tecido, folder) viram **faces**.
- **Curadoria** (`src/data/template-curation.json`, revisão visual de cada gabarito): rótulo de cada folha (Frente, Verso,
  Tamanho M, Capa…), lado (`front`/`back`/`other`) e nome de cada painel — referenciado pelo centro do corte (`at`, em mm), que
  continua certo se o extrator mudar —, lado e giro das faces (`faces`, ou `setFaces` desenhadas à mão), folhas manuais
  (`addPages`, ex.: gabaritos só em CorelDRAW), regra de medida livre (`parametric`) e o mapeamento produto → folhas (`byOption`,
  `bySize`) quando a medida da opção não basta. O script avisa quando uma folha ou painel da curadoria sumiu.
- **Produto → folhas.** O script liga cada valor de opção com medida ("21,0x29,7 cm", "0,20x0,30m") às folhas cujo corte bate
  (±2 mm ou 2%, nas duas orientações) e cada tamanho da grade das camisas à folha marcada com aquele tamanho. Valor sem folha =
  o arquivo do gabarito não traz aquela medida: a página fica sem encaixe (`src/lib/templates-data.test.ts` guarda as lacunas
  conhecidas e falha quando surge uma nova).
- **Na página do produto** (`src/lib/templates.ts`, puro e testado; `src/components/product/gabarito/`):
  - o editor 2D trabalha no **corte real** do painel da frente/verso, com a faixa de sangria em volta e as linhas do gabarito por
    cima; a imagem pode cobrir a sangria (`ArtLayout.overflow`) e o texto avisa quando sai da área de segurança;
  - ao enviar PNG/JPG/WEBP/**PDF**, o arquivo é **encaixado automaticamente**: folha inteira do gabarito → 1:1 na posição;
    tamanho com sangria → 1:1; tamanho final sem sangria → as bordas são estendidas até a sangria; outra proporção → cobre a
    sangria (ou, logo com fundo transparente, fica inteiro na área de segurança). PDF entra pela medida real da página;
  - gabarito deitado para peça em pé (ou o contrário) gira para editar e volta à posição original no PDF; gabarito que já traz
    as versões horizontal e vertical usa a da orientação da peça. Arquivo montado no gabarito na outra orientação (o baixado,
    deitado) é reconhecido do mesmo jeito e entra girado 90°; a folha inteira do gabarito entra 1:1 e **cada peça da folha**
    (frente, costas, laterais, faces de uma almofada) recebe o seu pedaço;
  - trocar a medida/tamanho com a imagem no encaixe automático refaz o encaixe na peça nova; mexer na imagem desliga os avisos
    de encaixe e "Voltar ao encaixe automático" refaz;
  - o bloco "Gabarito oficial" mostra tamanho final, sangria e segurança, como o arquivo entrou e a prévia das folhas (camisas:
    uma por tamanho com peças na grade) e gera o **PDF de impressão**: uma página por folha no tamanho real, arte de cada peça na
    posição do gabarito, sem as linhas, 300 dpi (menos em lonas grandes), TrimBox/BleedBox nas folhas de uma peça;
  - ao adicionar ao carrinho, esse PDF fica no IndexedDB do navegador (`print-store.ts`) e a linha do carrinho leva o id; o
    carrinho, o checkout, o resultado do pedido e "Meus pedidos" (por 14 dias) oferecem o download. Arquivo que o site não lê
    (CDR, AI) vai anexado como foi enviado, sem PDF no gabarito; LED neon não tem arquivo de impressão. No checkout, o PDF e os
    arquivos enviados sobem para o Bunny e vão no pedido (ver "Arquivos de arte no Bunny e o pedido");
  - limites: canvas de até 40 MP por painel (16 MP no iPhone/iPad, por isso lonas grandes saem com menos dpi), páginas acima
    de ~5 m com `/UserUnit`, PDF sem object streams. Página com só verso (cartão 4/0) e máscaras de verniz ficam fora.
- **QA:** `/design-system/gabaritos` lista todos os produtos com as medidas, o mapeamento e as pendências, e desenha as folhas
  de cada um. `/gabaritos` mostra a medida de cada gabarito ao lado do download.

### Arte: superfícies, verso, processos e arquivos automáticos

Base de arte da revisão da Padrão de 25/10/2026 ("Observações Site Novo"). Todos os módulos de regra são puros e testados.

- **Superfícies** (`src/lib/superficies.ts`). A frente é `art`, o verso é `art.back` e as outras partes ficam em `art.faces[id]`.
  Exemplos: lâminas do photobook, miolo da agenda, abas do porta passaporte, laterais da caixa acrílica, partes do short.
  - **De onde vêm:** das peças `other` do gabarito com nome; as folhas de máscara de verniz (`folhaDeVerniz`, campo `part`) ficam
    de fora.
  - **Verso:** aparece pela cor (x/1, x/4) ou pelo anexo "Impressão Verso" (`temVerso`), com ou sem gabarito.
  - **No ArtStep:** abas, ou a lista "Onde vai a arte" quando são muitas partes.
  - **No PDF:** `printSheets` põe a arte de cada superfície na peça dela.
  - **Sem manga:** a camisa de futebol "Sem Manga" não lista as mangas do gabarito (`superficiesDe({ semManga })`).
  - **Cama pet:** sem um verso à parte; as superfícies são as do gabarito (assento, fundo e laterais por dentro e por fora).
- **Vestuário sublimado inteiro** (`spec.fullPrint`, em `mockupSpec`). Vale para camisas, abadás, coletes, regatas, pijamas
  e o short, quando o serviço ou o tecido é de sublimação; polo, algodão, DTF e o body ficam de fora.
  - **Tecido:** sai na cor de fundo da arte.
  - **Camiseta (`TeeModel`):** a frente e as costas viram duas peles de ponta a ponta (`sublimationSkins`), e cada manga leva
    a arte dela (`sleeveArtGeometry`). A gola e as cavas ficam na cor do viés ou da ribana do acabamento (`accentColor`).
  - **Short:** são 4 partes, frente e costas de cada perna (`SHORTS_PARTS`).
  - **Polo:** a arte das costas usa a área do verso da opção (`backPrintCm`, 30 × 20 cm).
- **Processos** (`src/lib/processo.ts`):
  - **P&B (1/0 e 1/1):** tons de cinza.
  - **Laser (copo térmico):** um tom só.
  - **Talhamento (tábuas):** um tom só, e só arquivo vetorial.
  - **DTF:** sem fundo.

  O processo vale para a prévia, o 3D e o PDF (`ArtSettings.mono` no `paintArt`), filtra as paletas e mostra um aviso.
- **Orientação** (`src/lib/orientacao.ts`): horizontal ou vertical no crachá, no canvas e nos banners de medida definida. A
  escolha troca largura e altura da spec, e o gabarito acompanha. Ela não aparece no formato quadrado nem quando a opção do
  produto já diz a orientação.
- **Contorno automático** (`src/lib/contorno.ts`). É o mesmo traçado do acrílico do LED neon: campo de distância mais marching
  squares sobre a arte sem fundo.
  - **Lona com corte especial (41):** o 3D sai recortado a 1 cm do desenho, e o PDF vetorial "Faca de Corte" vai no pedido.
  - **Quadro acrílico com LED (337):** linhas de LED (`src/lib/led-linhas.ts`, testado), só na frente (`ArtSettings.led`). O LED
    é uma fita contínua que acende numa cor só, então cada linha tem uma cor; para trocar de cor, o cliente finaliza a linha e
    começa outra.
    - **Contorno automático:** um laço por parte do desenho, a 1,5 cm dele e a 1,2 cm da borda, cada um com a sua cor (guardada
      pela ordem, do maior para o menor). A imagem enviada com fundo branco perde o fundo sozinha, para o contorno seguir o
      desenho; foto ou arte com fundo ganha o LED na moldura. O contorno só desliga quando há uma linha do pincel.
    - **Pincel:** no editor (`ArtEditor2D` com `led`, painel `LedLinesPanel`), o arraste desenha por cima da imagem enviada ou
      da arte criada; soltar não termina a linha (o traço seguinte continua dela), um clique leva o LED reto até ali, dois
      cliques ou "Finalizar linha" terminam (fechando quando acaba perto do começo). "Desfazer" tira o último traço, e cada
      linha da lista troca de cor ou é apagada.
    - **Correção do traço** (`src/lib/led-forma.ts`, testado): ao finalizar, o traço feito à mão é interpretado e refeito limpo:
      reta, retângulo (endireitado quando quase alinhado), círculo ou elipse, polígono de 3 a 8 lados ou traço livre suavizado,
      sempre com os cantos no raio mínimo da fita (`LED_RAIO_CM` = 2 cm, provisório, a confirmar com a produção). O traço como
      foi desenhado fica guardado: "Usar o traço como desenhei" volta a ele e "Corrigir este traço" refaz; "Corrigir o traço
      sozinho" desliga a correção para as próximas linhas.
    - **Saídas:** o 3D (`NeonFrame`) mostra um tubo de uma cor por linha; o PDF "Posição do Led" (`arquivoDeLed`) tem a página 1
      com as linhas em magenta 100% e a página 2 com cada linha na cor do LED, numerada, e a legenda (cor, origem e comprimento);
      o carrinho e o pedido levam "Linhas de LED" (`resumoLed`).
  - **Arte com fundo:** a lona é cortada reta, e o LED fica na moldura.
  - **Arquivos:** os PDFs saem em `product/contorno-arquivo.ts`, com a linha em magenta 100% (o do LED com a página das cores).
- **Verniz localizado** (`src/lib/verniz.ts`):
  - **Escolha do cliente:** em cada lado, o que leva verniz (`ArtSettings.varnish`: imagem e texto, só a imagem ou só o texto).
  - **Máscara:** `varnishMask` pinta essas camadas em preto sobre branco. Ela sai pelo mesmo `printSheets`/`buildPrintPdf` do
    arquivo de impressão (mesma folha e posição) ou, sem gabarito, no tamanho da peça (`product/verniz-arquivo.ts`).
  - **Anexo:** "Verniz Local Frente/Verso" separados quando a variação tem esses tipos, senão "Verniz Localizado".
  - **No 3D:** a mesma máscara (em branco) é o `clearcoatMap` da frente impressa (`useArtTexture`, `PrintMaterial`).
- **Arquivo do cliente primeiro.** A faca, a posição do LED e a máscara de verniz só são geradas quando o cliente não mandou a
  dele nem o arquivo único. No "Selecione a arte", esses anexos aparecem como "feito automaticamente a partir da sua arte".
  - **Máscara de verniz:** não sai quando a frente veio pronta (arquivo único ou "Impressão Frente").
  - **Variação que não lista o tipo:** recebe o arquivo como "Arquivo Único" (`attachmentType`).
- **"Enviar sua arte" (modal "Selecione a arte", `SendArtDialog.tsx`).**
  - **Arquivos de produção primeiro:** o arquivo único sozinho ou um por parte.
  - **Montar a arte no site:** com uma imagem, por último.
  - **Prévia:** a arte aparece no mockup 3D quando o arquivo é lido.
  - **Criação de arte pela equipe:** custa o preço da variação, somado uma vez no item (`criacaoArte`, `PricedLine.criacao`).
  - **Nome da arte e observação:** vão para o pedido.
  - **Frente pronta** (`frenteEnviada`): a arte montada não vai e não sai o PDF do editor.
- **Conferência:**
  - `npm run shots -- --p=41,337 --modo=mark` fotografa com a arte da marca sem fundo.
  - `--faces=back,manga-direita` dá estampa própria (em outras cores) ao verso e às superfícies extras.
  - `--face=fundo-base` põe uma superfície "em edição".

### Preço por m², prazo e grade de tamanhos

- **Medida livre (m²).** Produtos com `customSize` (36 na API: banners, lonas, adesivos, rótulos, papéis, tecidos, placas e o
  LED neon de logotipo) pedem largura × altura em cm. Regras (revisão da Padrão de 25/10/2026), em `areaRules`/`areaQuote`
  (pricing.ts), as mesmas na página, no carrinho, na festa, na fachada e no pedido (`priceLine`):
  - total do item = preço da variação (por m²) × máx(peças × máx(área da peça, `tamanho_minimo` da API), **1 m²**): o mínimo de
    1 m² vale uma vez no item, não por peça; o preço por peça exibido é o total ÷ peças;
  - limites da **variação escolhida**: o catálogo guarda os próprios dela em `lm` quando diferem dos do produto (ex.: PS "Até
    15x21cm", máximo 0,15 × 0,21 m) e marca com `a: 0` a variação de preço fixo de um grupo misto (Faixa "2,00x0,60m"); leia
    com `sizeLimitsOf`/`usesArea(…, variation)`;
  - no pedido, `quantidade` = peças, `price` = total ÷ peças e `precoTotal` = total do item.
  A API não calcula m²: a medida vai em `widthCm`/`heightCm` do item do carrinho. O mockup 3D usa a medida digitada.
- **LED Neon montado pelo cliente** (`Product.neon`): cobrança mínima de 0,25 m² por peça, sem o mínimo de 1 m²; o "a partir
  de" da vitrine já é esse mínimo (R$ 560,50 na Frase, R$ 647,38 no Logotipo).
  - *Crie sua Frase (290, `neon: "frase"`)*: o cliente escreve o texto e escolhe a largura; a altura sai da proporção do
    texto medida no canvas (`neonTextBox`, art.ts), e o passo "Tamanho do letreiro" (`NeonSizeStep`) aplica as regras do site
    atual (`NEON_FRASE`: largura de 15 a 198 cm, altura de 15 cm por linha +3 cm com mais de uma e abaixo de 98 cm, "Até
    50cm"/"Acima de 50cm", aviso de retirada só em São João acima de 175 cm). O servidor refaz com as linhas pelo `Subtexto`.
  - *Logotipo (289, `neon: "logo"`)*: m² com quantidade; a arte é só por arquivo (`ArtStep uploadOnly`), sem editor de texto.
  - O Led Neon Número (298) vem com a mesma customização 4 da API, mas é peça de preço fixo: não é `neon`.
- **Econômico × expresso.** Cada variação traz preço e prazo dos dois; a página oferece a escolha quando o expresso muda o
  preço ou o prazo (`express: true` no item do carrinho).
- **Grade de vestuário.** Camisas com `sizes` pedem a quantidade por tamanho; o total respeita `minQty`/`maxQty` (lotes "de 11 a
  100", "a partir de 101"…) e vai ao carrinho com `quantity` = total de peças e a divisão em `options.Tamanhos` ("P×2, M×3").
- **Faixa de quantidade da variação.** Em 44 produtos a faixa é uma opção (Caderno, agendas, blocos, crachá, chaveiro: "De 1
  até 10", "De 11 até 100"…), cada uma com preço e limites próprios na API (qtde_minima/qtde_maxima de cada linha). O catálogo
  guarda a da variação em `mn`/`mx` quando difere da do produto (a da primeira linha), e `unitLimits` (pricing.ts) vale na página
  de produto (a quantidade segue a faixa escolhida), no carrinho (`/api/precos/limites` traz as faixas por variação) e no pedido
  (`priceLine`). Tabela de revenda: a faixa vem de cada linha da API.

### Monte Seu Kit (`/monte-seu-kit`)

- **Monte o seu kit** (`/monte-seu-kit/montar`, `components/kit/`, regras puras em `src/lib/kit-builder.ts`): assistente em quatro
  perguntas — para que é (boas-vindas da equipe, clientes, evento, lançamento da marca, loja, presente; "Festa" leva ao Crie Sua
  Festa), quantos kits, quanto investir por kit (faixas por pessoa ou por negócio) e o que não pode faltar, já marcado dentro do
  orçamento (`suggestPicks`: os essenciais primeiro, saindo do mais caro se passarem do teto, e os extras que cabem). Os cards da
  página do Monte Seu Kit entram com `?objetivo=`.
- **Valor:** cada item na quantidade do pedido inteiro (`planKitItem`: unidades por kit × kits), na faixa certa (variação com
  `mn`/`mx` ou produto da faixa, como a Camisa em Dryfit 01–10 / 11–100 / 101+), no pacote que sai mais em conta (adesivos,
  cardápios, tags), com um pacote por pessoa nos cartões de visita e o mínimo de cada produto; a tela mostra a faixa, os pacotes e
  a sobra. Valor por kit = total ÷ kits, sem desconto. Revendedor logado vê a tabela de revenda.
- **Kit montado:** itens com quantidade por kit, a opção que cada um troca (cor, formato, pacote), medida (m²) e grade de
  tamanhos; sugestões do objetivo e busca no catálogo inteiro (índice `/produtos/indice.json`; o preço do produto vem de
  `/api/kit/produto?slug=`); resumo com a prévia 3D do item em foco, valor por kit, kits, total, orçamento e prazo.
- **Personalização** (`components/kit/kit-art.ts`, `KitArtPanel`, `KitArtEditor`, `KitGallery`):
  - *O kit inteiro de uma vez:* o logo é enviado uma vez (o tratador da página de produto faz duas versões, com e sem o fundo
    branco) e entra em cada item encaixado na área de impressão dele (`sharedItemArt` → `autoFitArt` com `fitAreaFor` da peça;
    sem o fundo branco nas camisetas). Sem logo, o nome e a frase viram a arte no estilo escolhido (`StylePicker`); com logo, o nome
    pode entrar junto. Cores da marca (paletas) e fundo atrás do logo (branco ou a cor da marca).
  - *Um item por vez:* "Personalizar" abre o passo "Sua arte" da página de produto (`ArtStep`: texto, imagem, editor 2D, frente e
    verso, manequim) com o 3D da peça ao lado, começando pela arte do kit encaixada. O que muda fica só no item (`ItemArtState`);
    "Usar a arte do kit" volta para a comum. Não há "enviar a arte depois" (revisão da Padrão de 25/10/2026): todo item vai com arte.
  - *Fotos:* a prévia guarda a foto 3D do item quando o modelo fica pronto (`KitPreview`); "Ver o kit inteiro com a arte"
    (`KitGallery`) fotografa os itens que faltam, um por vez num único visualizador (um contexto WebGL). A foto vale enquanto a
    peça e a arte não mudam (`photoKey`) e é a miniatura do card e do carrinho.
  - *Carrinho:* "Adicionar kit ao carrinho" confere a arte (sem logo nem nome, aponta o painel), termina as fotos
    que faltam na galeria e manda cada item como produto comum: grupo do kit (`bundle`), opções do kit (Kit, Kits, Marca, Entrega
    desejada, Por kit), o resumo da arte da peça (`artSummary`, mais "Cores da marca"), a linha "Arte: …" (logo do kit, arte
    ajustada no item ou texto) e a foto 3D. O gabarito em PDF ainda não é gerado para os itens do kit.
- **Kits de festa prontos** (`/monte-seu-kit/<slug>`, `src/lib/party.ts`): composição fechada feita dos produtos do Crie Sua Festa.

## Multiloja (lojas de influenciadores e fornecedores)

Cada lojista tem a própria loja com os produtos da Padrão Color, a cor e a logo dele e a margem que ele escolhe. Uma instalação só atende
todas as lojas: a loja é escolhida pelo endereço.

- **Endereço.** `<subdominio>.<MULTILOJA_DOMINIO>` (DNS curinga `*.dominio` apontando para o site). Em desenvolvimento,
  `http://<subdominio>.localhost:3100`. `src/proxy.ts` reescreve esses hosts para `/vitrine/<host>/…` sem mudar a URL; o site principal
  segue igual e `/vitrine` direto nele dá 404. `/api` e `/painel` não são reescritos; `/admin` num host de loja dá 404.
  Domínio próprio: o lojista cadastra em Dados da loja e a loja passa a responder nele quando o DNS aponta para `MULTILOJA_DNS_ALVO`
  (verificado no painel) ou quando a Padrão libera em `/admin/lojas`.
- **Vitrine** (`src/app/(vitrine)/vitrine/[host]/`): início, produtos com busca/filtro/ordem, produto (o mesmo `ProductExperience` do site,
  com 3D e gabarito), carrinho, sobre, finalização e página do pedido (`/pedido/<código>?t=<token>`: status, Pix, boleto, cartão e envio de arte).
  Links de divulgação: `?ref=<nome>` marca a origem por 30 dias e o pedido leva essa origem; visitas contadas por dia.
- **Personalizar loja** (`/painel/personalizar`, editor em tela cheia; a antiga "Aparência" redireciona para ele). O lojista
  escolhe um dos 7 modelos prontos (Clássico, Boutique, Vibrante, Minimalista, Impacto, Empresas e brindes, Festas e eventos), que
  monta a página inicial inteira com o nome da loja nos textos, e ajusta: seções (12 prontas: destaque principal, banners, vantagens,
  categorias, vitrines de destaques/novidades/categoria/escolhidos, chamadas, quem somos, depoimentos, perguntas), ordem (arrastar ou
  ↑ ↓), esconder, duplicar; estilo (logo, 8 cores com contraste conferido, 5 fontes de título, cantos, botões, cartões, fundo);
  cabeçalho (3 formatos, faixa de aviso, busca, menu) e rodapé (3). A prévia ao vivo (`/painel/previa` num iframe, computador ou
  celular) recebe o tema por `postMessage`; clicar numa parte da prévia abre o formulário dela. Desfazer/Refazer (Ctrl+Z), rascunho
  salvo sozinho (`lojas.tema_rascunho`) e Publicar (`lojas.tema`; também sincroniza `paleta` e `logo`). Imagens enviadas no editor
  ficam no banco; ao publicar ou descartar, as que nenhum tema usa são apagadas. Tipos, modelos, seções prontas e a validação de tudo
  o que chega do navegador (`parseTema`: imagens só da própria loja, links só internos, textos com limite) em
  `src/lib/multiloja/tema.ts` (testado); desenho das seções em `src/components/vitrine/loja/Secoes.tsx` (o mesmo na loja e na prévia),
  CSS do tema em `loja/estilo.ts` + `.loja-tema` no `globals.css`; editor em `src/components/painel/editor/`.
- **Preço e comissão.** Preço base = preço do catálogo × `MULTILOJA_FATOR_BASE` (padrão 1, provisório até a Padrão definir a tabela da
  multiloja); preço da loja = base × (1 + margem), de 20% a 300%. No pedido, o servidor recalcula cada item duas vezes (`priceLine`): no
  preço da loja e no base. Comissão = pago pelo cliente − custo base − frete − taxa do pagamento (`src/lib/multiloja/pedido.ts`, testado).
  Fica "a liberar" até a entrega ou `MULTILOJA_DIAS_LIBERACAO` dias após o pagamento; o lojista pede saque (mínimo R$ 20) para a chave Pix.
- **Pagamento** (`payments.ts` + `gateways/`): Pix, boleto e cartão. Em `/admin/pagamentos` cada forma tem o seu gateway (Efí, Cielo,
  Pagar.me, Simulação ou Desligado), para todas as lojas: por exemplo, Pix pela Pagar.me e cartão pela Cielo. O botão "Usar para tudo"
  de um gateway põe ele em todas as formas que ele sabe cobrar (na Pagar.me, "Usar no Pix"); a tabela "Quem cobra cada forma" troca
  uma forma por vez e recusa gateway sem credenciais. Regras puras e testadas em `pagamento-rotas.ts`; a configuração antiga (um
  gateway para tudo) é lida como rota por forma. Cada pedido guarda o gateway que o cobrou (`pagamento_provedor`), então consulta,
  aviso, devolução e cancelamento de pedidos antigos continuam no gateway original depois da troca. Na mesma tela: taxa por forma
  (% + valor fixo, descontada da comissão) e dias de vencimento do boleto. Credenciais salvas lá ficam cifradas no banco
  (`settings.ts`) e valem no lugar das variáveis `MULTILOJA_EFI_*`/`MULTILOJA_CIELO_*`/`MULTILOJA_PAGARME_*`.
  Todo aviso de pagamento é conferido no gateway antes de marcar "pago". Cancelar um pedido pago devolve o Pix / estorna o cartão;
  boleto pago se devolve à parte (o pedido avisa). Pix vencido ou link expirado: o cliente gera outra cobrança na página do pedido.
  - `simulado`: só fora de produção (botão "Simular pagamento" na página do pedido).
  - `efi` (`gateways/efi.ts`): Pix pela API Pix (cobrança imediata, certificado .p12); boleto e cartão pela API de Cobranças (boleto com
    Pix "bolix" para pagar na hora; cartão na página segura da Efí). Rotas conferidas com a documentação e o SDK oficial. Webhook do Pix
    cadastrado pelo admin sem mTLS (`x-skip-mtls-checking`), com segredo na URL e IP da Efí; boleto e cartão avisam pela URL de
    notificação da cobrança. Em homologação o admin cria um Pix de teste de R$ 1,00.
  - `cielo` (`gateways/cielo.ts`): Pix (Provider `Cielo2`) e boleto (`Bradesco2`/`BancoDoBrasil3`; sandbox `Simulado`) pela API
    E-commerce 3.0; cartão pelo Link de Pagamento (página segura da Cielo, até 6x; OAuth com Client ID/Secret; sem sandbox, usar o Modo
    Teste). No portal da Cielo cadastram-se a URL de notificação da API (com o cabeçalho `X-Multiloja-Segredo`) e a URL de mudança de
    status do Link (com `?hmac=`); o admin mostra as duas e o segredo.
  - `pagarme` (`gateways/pagarme.ts`, dados puros e testados em `gateways/pagarme-dados.ts`): só Pix, pela API v5
    (`https://api.pagar.me/core/v5`, autenticação básica com a chave secreta; conferido em docs.pagar.me em 2026-10-09).
    `POST /orders` com o cliente (nome, e-mail, CPF/CNPJ, celular e endereço) e o Pix de 1 hora; o QR Code (`qr_code_url`) é
    guardado como imagem no pedido. `GET /charges/{id}` confirma o pagamento; `DELETE /charges/{id}` cancela o Pix em aberto ou devolve
    o pago. A chave de teste (`sk_test_…`) cai no simulador da própria Pagar.me (Pix de até R$ 500 é pago sozinho em segundos). Avisos
    em `POST /api/multiloja/pagamento/pagarme?hmac=<segredo>` (ou o segredo como senha da autenticação básica): o admin mostra a URL
    para cadastrar no painel da Pagar.me, com os eventos `charge.paid`, `charge.payment_failed`, `charge.refunded` e `order.canceled`.
  - `/admin/pagamentos` mostra o diagnóstico de cada gateway (credenciais, certificado, autenticação, webhook).
  - **Simuladores:** `node scripts/efi-mock.mjs` (launch "efi-mock", porta 3199) e `node scripts/cielo-mock.mjs` ("cielo-mock", 3198).
    Com `MULTILOJA_EFI_MOCK_URL` / `MULTILOJA_CIELO_MOCK_URL` num `.env.development.local` (ignorados em produção) dá para testar tudo sem
    credenciais: Efí `POST /mock/pagar/<txid>` (Pix acima de R$ 10) e `GET /mock/checkout/<id>` (cartão/boleto); Cielo
    `POST /mock/config {apiUrl, linkUrl, segredo}` (para onde avisar), `POST /mock/pagar/<PaymentId>` (Pix/boleto) e
    `GET /mock/link/<id>` (cartão). Testado ponta a ponta nos dois; nenhum dos dois rodou ainda contra o sandbox real.
    Pagar.me: `node scripts/pagarme-mock.mjs` ("pagarme-mock", porta 3195) com `MULTILOJA_PAGARME_MOCK_URL` e qualquer chave
    `sk_test_…` no admin; Pix de até R$ 500 é pago sozinho em 8 s (`PAGARME_MOCK_PAGA_EM`), `POST /mock/pagar/<ch_…>` paga na hora e
    `POST /mock/config {url}` diz para onde mandar os avisos. Testado ponta a ponta (Pix, aviso, confirmação e devolução); ainda não
    rodou com a chave de teste real.
- **Frete** pela API de frete da Padrão (ver "Frete"), o mesmo cálculo do site dela: `cotarFrete` (`vendas.ts`) manda o CEP do cliente
  e uma caixa por item do carrinho (embalagem da variação, volumes pelos lotes). O preço que volta é o que a Padrão cobra, sem margem:
  o frete não entra na comissão.
  - Checkout: ao digitar o CEP o cliente vê as formas de entrega (preço e prazo de transporte, contado depois que o pedido fica pronto),
    a mais barata já marcada. Ao fechar, o servidor cota de novo e recusa (409) se o valor mudou ou a forma escolhida sumiu. O pedido
    guarda serviço, prazo e custo (`frete_servico`, `frete_servico_id`, `frete_prazo`, `frete_custo`, `frete_gratis`), mostrados no
    painel, no admin e na página do pedido.
  - Produto sem embalagem cadastrada na Padrão: o checkout não fecha e mostra o WhatsApp da loja, porque o valor não seria o da
    Padrão. A Padrão completa a embalagem no sistema dela e o próximo `sync:catalog` traz.
  - "Frete grátis a partir de" (Dados da loja): o frete sai da comissão do lojista, e só vale quando a comissão cobre o frete.
  - Sem `PADRAO_FRETE_API_KEY`, cada loja cobra o frete fixo que definiu em Dados da loja (como antes).
- **Produção.** Em `/admin`, "Enviar para produção" monta o `gerarpedido` no preço base em nome de `PADRAO_MULTILOJA_CLIENTE_ID`; só chama a
  API com `PADRAO_ORDERS_ENABLED=true`, senão simula e mostra os dados. Status seguintes (enviado, entregue) com nota no histórico.
- **Painel** (`/painel`): cadastro; início com vendas dos 30 dias, saldo e checklist; vendas e detalhe do pedido (artes, valores,
  histórico); clientes; financeiro (saldo, chave Pix, saque, extrato); divulgação (links, visitas, conversão); produtos e margens; dados
  da loja (frete grátis a partir de; frete fixo só enquanto a API de frete da Padrão não está ligada; domínio próprio); aparência; conta. Server Actions em `painel/actions.ts`; a loja sempre vem
  da sessão.
- **Admin da Padrão** (`/admin`): visão geral (rede toda: visitantes, pedidos, conversão, abandono, canais, configuração), análises,
  pedidos de todas as lojas (produção e status), lojas, saques, pagamentos e as imagens e banners do site (ver "Imagens e
  banners do site"). Em Lojas a Padrão cria o lojista e a loja (senha provisória
  mostrada uma vez), gera senha nova, troca plano, tira do ar, bloqueia, libera domínio e abre ou fecha o cadastro público
  (`/painel/cadastro` fechado = "cadastro por convite"). Cada loja tem um raio-x em `/admin/lojas/<id>` (vendas, saldo do lojista, últimos
  pedidos e as mesmas análises só dela). Conta de admin criada com `MULTILOJA_ADMIN_SENHA=… npm run multiloja:admin -- email "Nome"`.
- **Rastreamento e análises** (`/admin/analises`, filtros de período e canal: tudo, só o site, só as multilojas ou uma loja). O site da
  Padrão (loja 0) e todas as lojas mandam eventos anônimos para `POST /api/eventos` (`src/lib/tracking.ts`, `PageTracker`): visita,
  produto visto, carrinho (+/−) e checkout; o servidor grava pedido feito (com os itens) e pago. Visitante e sessão são números
  aleatórios no navegador (sessão acaba após 30 min parada); sem nome, e-mail ou IP; robôs e quem liga "Global Privacy Control"/"Do Not
  Track" ficam de fora. O painel mostra funil (sessões em cada etapa), fluxo de pessoas e de vendas por dia e por hora, site × multilojas,
  produtos vencedores (vistos → carrinho → vendidos, receita no site e nas lojas), carrinhos abandonados (o que ficou e onde), origens e
  aparelhos. Consultas em `analytics.ts`; regras puras e testadas em `eventos.ts`. No site da Padrão o pagamento é confirmado no sistema
  da Padrão, então lá entram só os pedidos feitos.
- **Planos.** Grátis (10 produtos ativos), Básico (50) e Premium (sem limite), trocados no admin.
- **Dados.** Tudo num banco PostgreSQL: lojistas, lojas, produtos ativos, pedidos, saques, divulgação, admins, configurações (chaves
  cifradas), rastreamento e os arquivos enviados (logos, banners e artes, na tabela `arquivos`). Produção: `DATABASE_URL` (Supabase, Neon,
  RDS… com SSL; em serverless, a URL do pooler). Desenvolvimento: sem `DATABASE_URL`, `npm run dev` liga um Postgres de verdade embutido
  no projeto (`embedded-postgres`, dados em `.data/postgres`, porta 5433; `npm run db` liga só ele). Conexão e marcadores `?` em
  `src/lib/multiloja/pg.ts` (o site e os scripts usam); esquema em `schema.ts`, aplicado sozinho na primeira consulta (migrações em ordem,
  com trava para dois servidores não migrarem juntos; mudança = item novo no fim). Todo SQL fica em `repo.ts`, `repo-vendas.ts`,
  `analytics.ts`, `settings.ts` e `files.ts`. Datas em texto UTC `AAAA-MM-DD HH:MM:SS` (função `agora()`), dinheiro em double precision.
  Banco SQLite antigo: `npm run multiloja:migrar-sqlite` copia tudo de uma vez (recusa se o Postgres já tiver lojistas). Logins com scrypt
  e cookies lacrados próprios (`auth.ts`), com limite de tentativas.
- **Demonstração.** `npm run multiloja:seed` recria a loja `atelie-demo` (16 produtos, frete, 2 links) e um admin de teste; e-mails e
  senhas de teste estão no próprio script.
- **Pendências.** Tabela base da multiloja (`MULTILOJA_FATOR_BASE`), taxas reais dos pagamentos, a chave da API de frete no
  servidor (`PADRAO_FRETE_API_KEY`) e a embalagem dos produtos que ainda não têm, homologação da Pagar.me (chave secreta, Pix
  habilitado, webhook cadastrado) e da Cielo (credenciais do Link de Pagamento para o cartão, URLs de aviso cadastradas), cliente da multiloja na API Padrão, aviso de privacidade
  sobre o rastreamento anônimo e e-mails automáticos ao cliente (hoje ele recebe o link na tela e o lojista pode reenviar pelo painel).

## Estrutura

```
src/
  app/
    (loja)/          home, categoria, produtos, produto/[slug], carrinho (com header, rodapé e "Pular para o conteúdo")
    (checkout)/      checkout de demonstração
    (interno)/       design system e galeria de mockups (noindex)
    globals.css      tokens do design system (@theme) e utilitários
  components/
    ui/              primitivos: Button, IconButton, Badge, Price, OptionGroup, TextField, SegmentedControl, QtyStepper,
                     Accordion, Dialog, Drawer, SectionHeading, Breadcrumb, Spinner
    product/         configurador da página de produto (opções, ArtStep, pré-visualização)
    mockup/          visualizador 3D, pintura da arte e modelos
    design-system/   peças da página /design-system e o inspetor da galeria de mockups
  lib/               catálogo, preços, formatação, registro e regras de mockup (TS puro, testável com node --test)
  data/              catálogo, vitrine, tipos de negócio e acabamentos (gerados por npm run sync:catalog)
scripts/sync-catalog.mjs
```

## Mockups 3D

Todo produto do catálogo (361 da Padrão e 13 novos hoje) resolve para um dos **tipos** ("kinds") de mockup; a fachada de loja
(`storefront`) é um tipo só da página de Fachadas (`PAGE_KINDS`), sem produto do catálogo. Os modelos são 100% procedurais
(geometria + texturas desenhadas em canvas, sem arquivos .glb nem imagens externas) e recebem a arte do cliente.

O caminho de um produto até a tela:

1. **Registro — `src/lib/mockup-kinds.ts`.** `MOCKUP_KINDS` lista os tipos; `KIND_INFO` dá a cada um o nome em português, a
   medida padrão em cm, se a medida é a área de arte (`sizeIsArtArea`: caneca, camiseta…), se o modelo desenha cotas (`dims`) e
   a cena (`light` ou `dark`, usada pelo LED neon). `artAspect(spec)` é a proporção do canvas de arte.
2. **Regras — `src/lib/mockup.ts`.** `resolveKind(produto)` decide o tipo nesta ordem: override por slug
   (`src/lib/mockup-overrides.ts`) → `RULES` (regex sobre o nome sem acento, a primeira que casar vence) → `CATEGORY_DEFAULT` →
   fallback `sheet`. `VARIANTS` define subtipos por nome (`variantOf`), e `mockupSpec(produto, seleção)` monta a `MockupSpec`:
   medidas, formato (retângulo, redondo, coração), acabamento, cores de corpo/alça/tampa, metal, vidro, LED, gola, ilhoses,
   dobras, encadernação, se é vendido sem impressão (`blank`, a arte vira simulação) etc., a partir do nome e das opções escolhidas.
3. **Despacho — `src/components/mockup/models/index.tsx`.** Um `Record<MockupKind, ComponentType<ModelProps>>` liga cada tipo
   ao seu modelo; por ser um `Record`, um tipo novo sem modelo não compila.
4. **Modelos por família — `src/components/mockup/models/*.tsx`.** `paper`, `books`, `stickers`, `rigid`, `tabletop`, `boxes`,
   `signage`, `flags`, `textile`, `apparel`, `homegoods`, `totes`, `bags`, `drinkware`, `bottles`, `accessories`, `stationery`,
   `desk`, `comfort`, `linens`, `interior`. Peças compartilhadas:
   - `shared.tsx` — `useArtTexture` (arte em `CanvasTexture`), `PrintMaterial` (fosco/acetinado/brilho, verniz localizado),
     `Slab`, `makeShape`, `faceGeometry`, `fitFlat`, `bandGeometry`, cotas (`Dimensions`, `sizeLabels`), `useGeometryCleanup`.
   - `fabric.tsx` + `inflate.ts` — tecido com brilho de fibra, estampa por `Decal` e corpos "inflados" (almofadas, bolsas).
   - `vessel.tsx` — perfis de torno para canecas, copos e garrafas, com faixa de impressão.
5. **Arte — `src/components/mockup/art.ts`.** `paintArt` desenha a imagem enviada ou o texto em um dos modelos da família
   (`card`, `wrap`, `apparel`, `sign`, `badge`, `neon`, `home`), nas variantes `front`, `gray`, `blank` e `neon`. Máscaras
   (`roundPath`, `heartPath`, `featherPath`…) recortam a arte no formato da peça. As fontes ficam em `fonts.ts`.
6. **Visualizador — `src/components/mockup/MockupViewer.tsx`** (carregado sob demanda por `Mockup3D.tsx`). Enquadra o modelo pela
   esfera envolvente, apoia o ponto mais baixo no chão com sombra de contato, gira sozinho (para com movimento reduzido),
   renderiza sob demanda (`frameloop="demand"`) e captura o snapshot que vai para o carrinho. Os modelos podem pedir outro ângulo
   inicial com `userData.view = { elevation, azimuth, distance }` (`distance` < 1 aproxima a câmera), tirar elementos do
   enquadramento com `userData.noBounds` (cotas: também somem da sombra e do snapshot) ou `userData.noFrame` (fora do
   enquadramento, mas na imagem: o interior da fachada). `KIND_INFO.orbit` deixa a peça só de frente (sem giro automático e
   com órbita limitada), como a fachada. A prop `focus` (> 0; um número novo refaz) leva a câmera de frente para a parte
   marcada com `userData.focus` ({ elevation, margin }), escurece o estúdio para o fim de tarde (fundo, luzes e ambiente) e
   avisa o modelo por `useSceneMode().focus`; a foto do carrinho passa a ser essa vista. Sem WebGL, mostra a foto do catálogo.

### Fachadas (`/fachadas`)

Web to print da fachada da loja (`src/components/facade/FacadeStudio.tsx`, regras puras em `src/lib/facade.ts`):

1. **Medida** da placa (m ou cm): o preço sai por m² do material escolhido.
2. **Arte** no mesmo editor das páginas de produto (`ArtStep`, família `sign`): nome da loja, texto secundário, estilos
   prontos, fontes e cores, ou o arquivo do cliente (PNG, JPG, WEBP, SVG ou PDF, pelo tratador automático), com o editor 2D
   na medida da placa. AI, CDR e EPS vão pelo nome e seguem depois do pedido.
3. **Visualização:** o **mockup 3D** de uma fachada de loja (`models/storefront.tsx`) já abre com a arte de exemplo na placa,
   e o prédio cresce em volta da medida (calçada, rodapé de granito, porta de enrolar recolhida, vitrine de vidro com porta,
   interior visto pelo vidro, placa em ACM e refletores de LED). Ao clicar num estilo, a câmera vai de frente para a placa, o
   estúdio vira fim de tarde e os refletores acendem com uma piscada: luz na arte (`lightMap`, forte em cima), lentes, brilho,
   facho e a luz na parede; "Ver a placa de perto" / "Ver a loja toda" ficam ao lado da escolha 3D ou foto. A outra opção é
   **Na foto da sua loja**: a mesma arte, pintada na proporção da fachada, entra em perspectiva na foto do cliente (quatro
   cantos, até 8 fotos, luz e sombra da foto).
   - **Layout:** o 3D acompanha a edição. No computador ele fica preso ao lado dos passos e cabe na altura da tela
     (`clamp(20rem, 100dvh − 15rem, 40rem)`); no celular e no tablet em pé (`max-width: 1023px` e `min-height: 600px`) fica
     preso no topo, abaixo do cabeçalho, com um terço da tela. A foto da loja (cantos, fotos e ajustes) não fica presa: ao
     trocar para ela, a página volta até o começo do simulador. Os três passos usam o mesmo título numerado (`StepTitle`; o
     `ArtStep` aceita `heading`).
4. **Material** (lona, adesivo, placas) e carrinho: medida, opções do material, resumo da arte (`artSummary`) e a miniatura
   do 3D ou da foto. Nada é enviado durante a simulação.

### Adicionar um tipo novo

1. Acrescente o nome em `MOCKUP_KINDS` e a entrada em `KIND_INFO` (`src/lib/mockup-kinds.ts`).
2. Dê a ele uma família de arte em `FAMILY` (`src/components/mockup/art.ts`).
3. Faça os produtos chegarem nele: uma regra em `RULES` (antes das regras mais genéricas que também casariam), um padrão de
   categoria em `CATEGORY_DEFAULT` ou um override por slug em `mockup-overrides.ts`. Subtipos vão em `VARIANTS`; formatos com
   recorte, em `SHAPED_KINDS`; cor de peça pelo nome, em `NAMED_COLOR_KINDS`.
4. Crie o modelo `export function XModel({ spec, art, label, showDims }: ModelProps)` no arquivo da família (ou em um novo):
   +y para cima, frente para +z, proporções reais a partir de `spec.widthCm/heightCm/depthCm`, arte via `useArtTexture` sem
   esticar, geometrias memorizadas e descartadas (`useGeometryCleanup`), nada de assets externos.
5. Registre o modelo em `MODELS` (`src/components/mockup/models/index.tsx`).
6. Atualize os testes de `src/lib/mockup.test.ts` (contagem por tipo, produtos conhecidos) e rode `npm test` e `npm run lint`.
7. Confira o resultado em `/design-system/mockups?kind=<tipo>` com texto, imagem e cada opção do produto.

## Rotas internas

Ficam no grupo `(interno)`, com cabeçalho próprio (sem o menu da loja) e `noindex`:

- **`/design-system`** — tokens lidos do `globals.css` (cores com contraste WCAG, tipografia, raios, sombras, camadas, curvas
  de movimento), todos os componentes de UI em demos interativas, padrões da loja (card de produto real, passo do configurador,
  preço com PIX), a tabela dos 65 tipos de mockup com a contagem de produtos e o checklist de acessibilidade.
- **`/design-system/mockups`** — galeria de QA: todos os produtos com o tipo resolvido e a origem da regra, filtros por tipo
  (`?kind=mug`) e por origem (`?source=fallback`), e um inspetor com o modelo 3D, as opções do produto e teste de texto/imagem.

## Regras do design system

- Identidade do Figma "LOJA ONLINE - PADRAOCOLOR" (outubro de 2026): fonte Raleway (números alinhados) e o laranja #ff4d00
  nos tokens `coral*` (o nome ficou porque as lojas da multiloja trocam essas variáveis); `vitrine` (#f7f7f7) nas faixas
  cinza, `foto` atrás das fotos de estúdio e `night` na faixa escura. A Figtree continua para as artes do 3D e as lojas.
- `container-site` segue a grade do Figma: 1064 px de conteúdo a 1280 px, crescendo até 1300 px.
- Use sempre os tokens (`bg-mist`, `text-coral-700`, `rounded-card`, `shadow-card`, `shadow-cartao`, `z-drawer`…), nunca hex
  ou rgb solto em classe.
- Branco sobre o laranja só em texto grande (≥ 19px bold ou ≥ 24px); texto pequeno, PIX e erros usam `coral-700`. Os pares aprovados são testados em
  `src/lib/tokens.test.ts`.
- Foco visível em tudo, alvos de toque com 24px ou mais (a loja mira 44px), gavetas e acordeões fechados com `inert`, e toda
  animação com saída para `prefers-reduced-motion`.
