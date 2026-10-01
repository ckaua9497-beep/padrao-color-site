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

## Dados reais × demonstração

- **Catálogo real.** Produtos, categorias, opções, variações de preço, prazos e fotos vêm de `src/data/catalog.json`, gerado a
  partir do catálogo exportado do site atual da Padrão Color. As fotos são servidas por `img.padraocolor.com.br` (liberado em
  `next.config.ts`). `public/search-index.json` é o índice leve da busca.
- **Checkout de demonstração.** Carrinho (guardado no `localStorage` do navegador), CEP e finalização funcionam de ponta a ponta,
  mas **nenhum pagamento é processado** e nenhum pedido chega à gráfica: o checkout mostra "Pedido de demonstração registrado".
- O desconto de 5% no PIX (`PIX_DISCOUNT` em `src/lib/pricing.ts`) é aplicado em todos os preços exibidos.

### Regenerar o catálogo

O script `scripts/build-catalog.mjs` lê o JSON exportado (chave `padrao`) e reescreve `src/data/catalog.json` e
`public/search-index.json`. O caminho de origem vem da variável de ambiente `PADRAO_CATALOGO`; sem ela, o script usa
`C:/Users/USER/Desktop/padraocollor/data/catalogo.json`.

```bash
# PowerShell
$env:PADRAO_CATALOGO = "C:/caminho/para/catalogo.json"; node scripts/build-catalog.mjs

# bash
PADRAO_CATALOGO=/caminho/para/catalogo.json node scripts/build-catalog.mjs
```

Depois de regenerar, rode `npm test`: o teste de contagem por tipo de mockup (`src/lib/mockup.test.ts`) acusa produtos novos que
caíram em outro tipo ou no fallback, e o teste de overrides acusa slugs que sumiram.

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
  data/catalog.json  catálogo gerado
scripts/build-catalog.mjs
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
