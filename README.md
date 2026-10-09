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
| `npm run dev`   | Servidor de desenvolvimento com recarga ao vivo.                                                   |
| `npm run build` | Build de produção (as páginas de produto e categoria são geradas estaticamente).                   |
| `npm start`     | Serve o build de produção.                                                                         |
| `npm run lint`  | ESLint (`eslint-config-next` + regras do React Compiler). Deve terminar com 0 erros e 0 avisos.    |
| `npm test`      | Testes com `node --test` em `src/**/*.test.ts` (regras de mockup e contraste dos tokens).           |
| `npm run sync:catalog` | Baixa catálogo e vitrine da API Padrão Color para `src/data/` (ver "Catálogo, vitrine e ambiente"). |
| `npm run sync:novos` | Consome a API própria `/api/novos` e grava `src/data/catalog-novos.json` (ver "Produtos novos"). |
| `npm run fotos:novos` | Fotografa os produtos novos (mockup 3D + estampa da marca) em `public/produtos-novos/`. |

## Dados reais × demonstração

- **Catálogo real.** Produtos, categorias, opções, variações de preço, prazos, fotos e a vitrine vêm da API Padrão Color,
  sincronizados em `src/data/` (ver "Catálogo, vitrine e ambiente"). As fotos são servidas por `img.padraocolor.com.br`
  (liberado em `next.config.ts`).
- **Checkout de demonstração.** Carrinho (guardado no `localStorage` do navegador), CEP e finalização funcionam de ponta a ponta,
  mas **nenhum pagamento é processado** e nenhum pedido chega à gráfica: o checkout mostra "Pedido de demonstração registrado".
- O desconto de 5% no PIX (`PIX_DISCOUNT` em `src/lib/pricing.ts`) é aplicado em todos os preços exibidos.

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

Variáveis novas das outras frentes (conta, pedidos, pagamento) ficam descritas no próprio `.env.example`.

### Sincronizar o catálogo

```bash
npm run sync:catalog   # ~60 s, só faz GET na API (usa PADRAO_API_URL e PADRAO_API_TOKEN do .env.local)
npm test               # tipos de mockup, preços (m², expresso, grade) e tokens
```

`scripts/sync-catalog.mjs` lê `GET /categorias`, `/grupos`, `/produtos?id_grupo=…` (sem filtro essa rota estoura o gateway),
`/configuracoes`, `/tiposnegocio` e `/acabamentos`, e grava:

| Arquivo                        | Conteúdo                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/catalog.json`        | Categorias (banner, banner de celular e SEO) e produtos. Produto = grupo da API (uma página, slug igual ao do site oficial); variação = produto da API (ID que vai no pedido, preço e prazo econômico/expresso, quantidade). Traz resumo, descrição, blocos de informação, gabarito, tags, SEO, "veja também", grade de tamanhos, tabela de medidas, medida livre (m²), criação de arte, anexos e quantidade mínima/máxima. O produto "Tags" é derivado do grupo 180 (tag de presente). |
| `src/data/storefront.json`     | A vitrine do padraocolor.com.br: banners (desktop e celular, com a medida real das artes), botões das linhas 1 e 2, categorias em destaque, "Nossos Destaques", mais vendidos, menu oficial, texto e faixa do topo. Links do site oficial viram rotas locais (`/produto/…`, `/categoria/…`).                                                                       |
| `src/data/business-types.json` | "Para o seu negócio": tipos de negócio com banner, SEO e grupos (páginas `/negocios/[slug]`).                                                                                                                                                                                                                                                                    |
| `src/data/finishes.json`       | Acabamentos (`GET /acabamentos`).                                                                                                                                                                                                                                                                                                                                |

Depois de sincronizar, rode `npm test`: o teste de contagem por tipo de mockup (`src/lib/mockup.test.ts`) acusa produtos novos que
caíram em outro tipo, e o teste de overrides acusa slugs que sumiram.

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
- **Sincronização:** `scripts/sync-novos.mjs` usa o mesmo mapeamento do `sync-catalog.mjs` (`scripts/lib/catalog-map.mjs`).
  `NOVOS_API_URL` aponta para outro endereço (padrão `http://localhost:3100/api/novos`); `--local` lê a fonte sem servidor.
- **No site:** categoria "Produtos Novos" (`/categoria/produtos-novos`), aba na 2ª linha do menu e logo depois das categorias em
  destaque na home. O produto leva `source: "site"`: sem tabela de revenda (não existe na API da Padrão), e com o pedido real
  ligado o item volta do checkout com o aviso de fechar pelo atendimento, porque o ID dele não existe no `gerarpedido`. Quando a
  Padrão cadastrar o produto, ele sai da fonte e passa a vir pelo `sync:catalog`.
- **Preços e prazos** são valores de referência a validar pela Padrão; a fonte marca isso em `parametros.precos` e
  `parametros.prazo`.
- **Fotos:** `scripts/fotos-produtos.mjs` abre `/design-system/fotos?p=<slug>&cor=<token>&modo=pattern|mark&giro=…&op=Chave:Valor`,
  que renderiza o mockup 3D com a estampa da marca (`src/components/mockup/brand-art.ts`: fundo chapado no espectro do logo,
  contornos brancos e as peças do símbolo; `mark` é a versão de 1 cor para serigrafia) e captura sem fundo
  (`CaptureFn({ transparent: true })`), recortada e centralizada em 600×600 WebP como as fotos do site oficial.

### Rotas de dados

- **`/produtos/indice.json`** — índice leve da busca do topo, gerado do catálogo no build (substitui o antigo
  `public/search-index.json`).
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
  ou sem gabarito). Sem gabarito: `src/components/product/auto-fit.ts` (refaz o encaixe ao trocar de formato; botões
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
    (CDR, AI) vai anexado como foi enviado, sem PDF no gabarito; LED neon não tem arquivo de impressão. O envio automático
    para a API depois do pedido depende do número de cada item (`pedido`) na resposta do `gerarpedido`, que o contrato ainda
    não define;
  - limites: canvas de até 40 MP por painel (16 MP no iPhone/iPad, por isso lonas grandes saem com menos dpi), páginas acima
    de ~5 m com `/UserUnit`, PDF sem object streams. Página com só verso (cartão 4/0) e máscaras de verniz ficam fora.
- **QA:** `/design-system/gabaritos` lista todos os produtos com as medidas, o mapeamento e as pendências, e desenha as folhas
  de cada um. `/gabaritos` mostra a medida de cada gabarito ao lado do download.

### Preço por m², prazo e grade de tamanhos

- **Medida livre (m²).** Produtos com `customSize` (36 na API: banners, lonas, adesivos, rótulos, papéis, tecidos, placas e o
  LED neon de logotipo) pedem largura × altura em cm. Preço da peça = preço da variação (por m²) × área cobrada, respeitando a
  área mínima e os limites da API (em metros); a quantidade multiplica. Quando o produto também vende formatos fixos (Faixa
  "2,00x0,60m", PS "Até 15x21cm"), o m² só vale na opção "Personalize a sua Medida"/"Personalizado". A API não calcula m²: o
  valor vai no `precoTotal` do pedido e a medida em `widthCm`/`heightCm` do item do carrinho. O mockup 3D usa a medida digitada.
- **Econômico × expresso.** Cada variação traz preço e prazo dos dois; a página oferece a escolha quando o expresso muda o
  preço ou o prazo (`express: true` no item do carrinho).
- **Grade de vestuário.** Camisas com `sizes` pedem a quantidade por tamanho; o total respeita `minQty`/`maxQty` (lotes "de 11 a
  100", "a partir de 101"…) e vai ao carrinho com `quantity` = total de peças e a divisão em `options.Tamanhos` ("P×2, M×3").

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

Todo produto do catálogo (361 da Padrão e 13 novos hoje) resolve para um de **65 tipos** ("kinds") de mockup. Os modelos são 100% procedurais
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
   inicial com `userData.view = { elevation, azimuth }` e tirar elementos do enquadramento com `userData.noBounds`.
   Sem WebGL, mostra a foto do catálogo.

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

- Use sempre os tokens (`bg-mist`, `text-coral-700`, `rounded-card`, `shadow-card`, `z-drawer`…), nunca hex solto em classe.
- Branco sobre coral só em texto ≥ 19px bold; texto pequeno, PIX e erros usam `coral-700`. Os pares aprovados são testados em
  `src/lib/tokens.test.ts`.
- Foco visível em tudo, alvos de toque com 24px ou mais (a loja mira 44px), gavetas e acordeões fechados com `inert`, e toda
  animação com saída para `prefers-reduced-motion`.
