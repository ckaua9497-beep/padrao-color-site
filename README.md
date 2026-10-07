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

### Rotas de dados

- **`/produtos/indice.json`** — índice leve da busca do topo, gerado do catálogo no build (substitui o antigo
  `public/search-index.json`).
- **`/api/gabarito/[id]`** — download do gabarito de um produto (`id` do catálogo, ex. `35` ou `tags`, ou o slug). Premissa: o
  "PG Gabarito" do checklist não tem contrato e nenhum endpoint do PDF baixa gabarito; o arquivo vem do campo `gabarito` de
  `GET /grupos`, a mesma URL usada em padraocolor.com.br/gabaritos. A rota só busca em `https://img.padraocolor.com.br/padraocolor/…`,
  repassa o arquivo em streaming com `Content-Disposition: attachment; filename="gabarito-<slug>.<ext>"` e o tipo certo (zip, rar,
  pdf) e responde 404 quando o produto não tem gabarito. A página `/gabaritos` lista todos, com busca e filtro por categoria.

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

Todo produto do catálogo (361 hoje) resolve para um de **64 tipos** ("kinds") de mockup. Os modelos são 100% procedurais
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
  preço com PIX), a tabela dos 64 tipos de mockup com a contagem de produtos e o checklist de acessibilidade.
- **`/design-system/mockups`** — galeria de QA: todos os produtos com o tipo resolvido e a origem da regra, filtros por tipo
  (`?kind=mug`) e por origem (`?source=fallback`), e um inspetor com o modelo 3D, as opções do produto e teste de texto/imagem.

## Regras do design system

- Use sempre os tokens (`bg-mist`, `text-coral-700`, `rounded-card`, `shadow-card`, `z-drawer`…), nunca hex solto em classe.
- Branco sobre coral só em texto ≥ 19px bold; texto pequeno, PIX e erros usam `coral-700`. Os pares aprovados são testados em
  `src/lib/tokens.test.ts`.
- Foco visível em tudo, alvos de toque com 24px ou mais (a loja mira 44px), gavetas e acordeões fechados com `inert`, e toda
  animação com saída para `prefers-reduced-motion`.
