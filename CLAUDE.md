# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Online store for Padrão Color (print shop): every product has a configurable procedural 3D mockup. Stack: Next.js 16 App Router, React 19 + React Compiler, Tailwind 4, three.js + React Three Fiber + drei, strict TypeScript. UI copy and code comments are Brazilian Portuguese; keep them that way.

`README.md` is the detailed reference: catalog fields, m²/express/size-grid pricing, how to add a mockup kind, and design-system rules. Read it before touching those areas. Sibling folders in the parent directory:
- `../padrao-loja`: frozen JS prototype. Reference only; never edit it.
- `../alteraçoes`: the client's task checklist and the API PDF (`DocumentacaoPadraoColor.pdf`).

## Commands

- `npm run dev -- -p 3100`: dev server. Port 3100 is what `../.claude/launch.json` ("site") starts and the preview tools expect. `next dev` writes to `.next/dev`, so `npm run build` can run alongside it.
- `npm run build`: production build. Product, category and kit pages are SSG.
- `npm run lint`: the bar is 0 errors and 0 warnings, including the React Compiler rules.
- `npx tsc --noEmit`: type check (there is no script for it).
- `npm test`: runs `node --test` over `src/**/*.test.ts`.
  - Single file: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/pricing.test.ts`.
  - Add `--test-name-pattern="..."` to filter by test name.
- `npm run sync:catalog`: pulls the catalog and storefront from the API into `src/data/`. It is GET-only, takes about 60 s and needs `.env.local` (see `.env.example`). Run `npm test` afterwards: the per-kind count snapshot in `src/lib/mockup.test.ts` flags products that changed mockup kind.
- `npm run sync:novos`: consumes the site's own API (`/api/novos`, same format as the Padrão API) and writes `src/data/catalog-novos.json`, which `catalog.ts` merges with `catalog.json`. Needs the dev server up (or `-- --local`). Source of truth: `src/data/novos/fonte.json`. README "Produtos novos".
- `npm run fotos:novos`: renders each new product's 3D mockup with the brand pattern (`/design-system/fotos`) and saves 600×600 transparent WebP photos to `public/produtos-novos/`. Needs Chrome and the dev server.
- `npm run sync:templates`: reads every product's official print template (gabarito) into `src/data/templates.json` (README "Gabaritos"). Run it after `sync:catalog`. The first run downloads ~5 GB into `.cache/gabaritos/` and takes several minutes; later runs reuse the cache. `src/lib/templates-data.test.ts` then flags options that lost their template sheet.

**Test-module import rule.** Tests run on raw `.ts` through Node's type stripping, with no bundler. Any module a test imports, directly or transitively, must:
- import runtime values through relative paths with an explicit `.ts` extension, never through the `@/` alias;
- bring in types only with `import type`;
- contain no JSX.

Examples: `src/lib/{mockup,pricing,orders,party,facade}.ts`, `src/components/mockup/environments/*.ts` and `src/components/mockup/models/apparel/{body,garment,pieces}.ts`.

## Architecture

### Data flow

The Padrão Color API (`PADRAO_API_URL`; the lab host answers only over HTTPS) is read at build time:
1. `scripts/sync-catalog.mjs` writes `src/data/{catalog,storefront,business-types,finishes}.json`.
2. `src/lib/catalog.ts` exposes that data.
3. Pages are generated from it. Product = API group; variation = API product, whose ID goes into the order.

At runtime, only account, order, price and template routes call the API:
- They live in `src/app/api/*` and use `src/lib/api/client.ts` and `padrao.ts`. Both are `server-only`, so the integration token and customer tokens never reach the browser.
- The API host does not send the Let's Encrypt intermediate certificate, so Node's `fetch` rejects it (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) and every call (login, signup, prices, orders) fails. The transport in `src/lib/api/transport.ts` (used by `client.ts` and `sync-catalog.mjs`) therefore uses `node:https` with the chain in `src/lib/api/tls-chain.ts`. `tls-chain.test.ts` fails 60 days before those certificates expire; refresh them from `http://<name>.i.lencr.org/`.
- The API's firewall blocks by IP whoever opens too many connections or fails too many logins (it happened on 2026-10-07; hosts outside Brazil can't connect at all). So `client.ts` allows at most 6 GETs in flight per process. When the host is unreachable it fails every call with `ApiError` 503 for 30 s, without opening sockets, and `sync:catalog` stops at the first unreachable error. `transport.ts` gives `timeoutMs` to the connection (TCP + TLS), then uses it as the time allowed with no bytes, and retries a dead keep-alive socket once on a fresh connection (GET and login only). `transport.test.ts` covers this with local servers only. Never test the network layer or wrong-password logins against the real API.
- Server logs: `[api] METHOD /path: sem conexão com HOST (...)` means the host is down or blocking this IP; `sem resposta da API por N s` means it connected but stopped responding; other non-business HTTP statuses (5xx, 403, 429, 3xx) are logged with their status.
- The logged-in session is a sealed cookie (`src/lib/session.ts`, `src/lib/api/seal.ts`).
- POST routes go through `src/lib/api/guard.ts`, which checks the origin and applies the rate limit.
- Reseller prices: `src/lib/customer.tsx` (client store) fetches `/api/precos`, which calls `GET /produtos` with the customer's own token. Cart lines and `precoTotal` use those prices. The "a partir de" of product cards, the category banner and the header search comes from `/api/precos/minimos` (`useFromPrices`, one batched call per render; catalog price for everyone else).
- Checkout builds the `gerarpedido` payload in `src/lib/orders.ts`. A real POST is sent only when `PADRAO_ORDERS_ENABLED=true`; otherwise the payload is simulated and shown.

The API holds live data. Do not call write endpoints while developing unless the user explicitly asks: `gerarpedido`, `cadastrarcliente`, `atualizacliente`, `atualizarpagamento`, `cancelarcompra`/`cancelarpedido`, `reenviararte`, `recuperar*`, `alterarsenhaatual`.

Dates sent to the API must be DD/MM/AAAA, even though the PDF says AAAA-MM-DD.

### Mockup pipeline (product to 3D)

1. **Registry.** `src/lib/mockup-kinds.ts` defines `MOCKUP_KINDS` and `KIND_INFO`, with default size, scene, dims and art aspect.
2. **Kind and spec.** In `src/lib/mockup.ts`:
   - `resolveKind` tries, in order: slug override (`mockup-overrides.ts`), then the `RULES` regexes on the accent-free name, then `CATEGORY_DEFAULT`.
   - `mockupSpec(product, selection)` builds the `MockupSpec` (measures, colors, variant…) from the name and the chosen options.
3. **Dispatch.** `src/components/mockup/models/index.tsx` maps kinds to models with a `Record<MockupKind, Component>`, so a new kind without a model fails to compile. Models live in family files; a model is built in cm inside a scaled group, front facing +z.
4. **Art.** `src/components/mockup/art.ts` paints the customer's art (image, text and template style) to a canvas. The printable area and layout come from `ArtSettings`, which also carries `layout`, `back`, `mannequin`, `region` and `ledColors` for the web-to-print editor in `src/components/product/art-editor/`.
   - **Uploaded images go through the automatic handler.** `src/components/mockup/image-intake.ts` decodes with `createImageBitmap` (EXIF orientation) and hands the bitmap to a Worker (`image-intake.worker.ts` → `image-process.ts`, OffscreenCanvas; same steps on the main thread when unsupported), so the page never freezes. SVG is rasterized from its viewBox (vector, no dpi warning; the print SVG keeps the preview's viewBox). A file whose original pixels match the piece's template (sheet/bleed/trim, `madeForTemplate` in `gabarito/jobs.ts`) goes in as is. Otherwise it trims empty margins (measured at 1024 px with a tight tolerance, so thin strokes and light taglines stay), removes a white background on apparel and plastic/kraft bags, and outputs a `blob:` preview (≤ ~4 MP, PNG/JPEG, within the device canvas cap: `canvasLimitsFor`). The print source (original, treated full-resolution PNG, or cropped SVG) and the original `File` ("Usar a imagem original") go to `registerSource`; `retainSources` pins what the page uses and frees swapped images.
   - The pure decisions live in `src/lib/image-prep.ts` (tested): border measured on a 3% band (a thin frame falls back to the inner ring), photo vs logo (transparency, or few colours and little soft shading: `softShading` keeps studio photos on white as photos), focus point, `autoFit` (photo fills the area centred on the subject up to 45% crop; a logo stays whole, centred, capped 2% above the minimum dpi for the piece size, on the colour of its border only when the image is opaque), `dpiTargets` by piece size and texture size.
   - Products without a template are fitted by `src/components/product/auto-fit.ts` (refit when the area changes; "Preencher a área" / "Imagem inteira"; "Voltar ao encaixe automático" in the editor). Template products are fitted by `fitToTemplate` (`gabarito/jobs.ts`), which uses the same analysis for files not made on the template and keeps a mug logo in the front window (`Gabarito.fitWindow`). `templateFit` records the mode, crop, dpi limit and the background the handler set (restored when another image comes in). `plausibleArtwork` (templates.ts) stops a tiny bitmap being matched as final artwork (sheet measured by the sheet, bleed/trim by the piece; vectors always pass). Art textures with an image are 2048 px (1536 on touch devices), 1024 while the 2D editor is being dragged (`art-gesture.ts`).
5. **Viewer.** `MockupViewer.tsx` is loaded lazily, with `ssr: false`, through `Mockup3D.tsx`.
   - Rendering is on demand (`frameloop="demand"`). Floor alignment and framing use the mesh bounds; snapshots feed the cart.
   - Optional room scenes come from `environments/`.
   - Hooks that models can read or set: `userData.view` (initial angle), `userData.noBounds` (exclude from framing), `userData.unitsPerCm` and `roomPose` (room placement), and `useSceneMode()` from `viewer-hooks.ts` (room, back/"Ver verso", motion).

### T-shirt and mannequin

The t-shirt pipeline lives in the folder `src/components/mockup/models/apparel/`. Don't confuse it with the file `models/apparel.tsx`, which holds socks, shorts and swimsuits.
- **`body.ts`:** the parametric display torso. It is a loft of superellipse sections built from girths per body type and size, plus a polar table r(φ, y).
- **`garment.ts`:** dresses that body. The fabric is snug at the shoulders, hangs below the chest and shoulder blades, and turns the extra fabric into ease plus folds. It also defines the neckline and the armhole loop.
- **Other pieces:**
  - `pieces.ts`: sleeves, trims, seams, the print "skin" measured in cm along the fabric, and vertex AO;
  - `polo.ts`: the polo collar;
  - `stitches.ts`: instanced stitching;
  - `textures.ts`: knit normal maps and the armhole alpha mask.
- **`TeeModel.tsx`:** assembles everything. `TshirtModel` in `textile.tsx` routes every variant to it except the baby `body`, which still uses the old panel model.
- **Mannequin setting:** `art.mannequin` holds size and body; `null` hides the mannequin, giving the ghost style. Body measures and fit come from `src/components/product/art-editor/mannequin.ts`.

### Print templates (gabaritos)

- **Data:** `scripts/sync-templates.mjs` → `src/data/templates.json`, using the hand/agent-reviewed overrides in `src/data/template-curation.json` (panels referenced by cut centre `at`). Only the server reads the JSON (`src/lib/templates-data.ts`, `server-only`); the product page gets the product's own sheets as `printTemplate`.
- **Logic:** `src/lib/templates.ts` is pure and test-importable: picking sheets for the selection (`pagesFor`, an option value mapped to no sheet means no template), pieces and faces (`piecesOf`, `panelFor`), orientation (`orientPages`), artwork matching and fit (`matchArtwork`, `autoPlacement`), mm↔editor placement.
- **UI:** `ArtEditor2D` takes `template` (the piece's upright panel): the stage is the cut, the canvas includes the bleed (`paintArt(..., { bleed })`, which also stretches the edge pixels into the bleed), and the image may overflow (`ArtLayout.overflow`). `src/components/product/gabarito/` has the "Gabarito oficial" block, the SVG sheet, the PDF builder (`pdf-lib`, lazy) and the PDF reader (`pdfjs-dist`, lazy).
- **Files:** the print PDF is stored in IndexedDB (`print-store.ts`); cart lines keep only `printFile.id`.

### Product page, cart, extra flows

- **Product page.** `src/components/product/ProductExperience.tsx` turns option selection into a variation and a quote (`src/lib/pricing.ts`: tiers, m² area pricing, express, size grid). It also builds the spec and the `ArtStep`, and adds to the cart with a snapshot.
- **Cart.** `src/components/cart/CartProvider.tsx` stores the cart in localStorage.
- **Crie Sua Festa / Monte Seu Kit:** `src/lib/party.ts` and `components/party/`.
- **Fachadas:** `src/lib/facade.ts` and `components/facade/`.

### Multiloja (stores for influencers and suppliers)

- One install serves every store by host: `src/proxy.ts` rewrites `<sub>.<MULTILOJA_DOMINIO>` (dev: `<sub>.localhost:3100`) to `src/app/(vitrine)/vitrine/[host]/`; `/api` and `/painel` are never rewritten. The store's palette overrides the coral CSS variables (`paletteVars`).
- Lojista panel: `src/app/(painel)/painel/` (Server Actions in `actions.ts`; the store always comes from the session via `requirePainel()`). Padrão admin: `src/app/(admin)/admin/` (`requireAdmin()`).
- `src/lib/multiloja/`: `core.ts` and `pedido.ts` are pure and tested (host parsing, margin/price, plans, palettes, order totals, commission, balance); `schema.ts` (migrations), `db.ts` (node:sqlite in `.data/`), `repo.ts` + `repo-vendas.ts` (all SQL), `auth.ts` (scrypt + sealed cookies for lojista and admin), `tenant.ts` (store from host, priced products), `vendas.ts` (place order, confirm payment, send to production), `payments.ts` (simulated / Efí Pix + card link), `config.ts` (env), `files.ts` (uploads and order art).
- Orders: the server reprices every cart line with `priceLine` at store price and at base price; the browser total is only compared (409 when it changed). Payment webhooks are re-checked against the provider before marking "pago".
- Production send (`gerarpedido`) only with `PADRAO_ORDERS_ENABLED=true` and `PADRAO_MULTILOJA_CLIENTE_ID`; otherwise simulated.
- Efí: routes checked against the official docs and SDK; tested end to end against the local simulator `scripts/efi-mock.mjs` (set `MULTILOJA_EFI_MOCK_URL` in `.env.development.local`, never in production). Not yet run against the real Efí sandbox.
- `npm run multiloja:seed` recreates the demo store `atelie-demo` and a test admin (test logins inside the script).
- Server components must not call `Date.now()`/`new Date()` directly (React Compiler purity rule): use `sqlDaysAgo`, `dayKeyDaysAgo`, `commissionReleased` from `core.ts`.

### Layout and design system (user-approved: do not redesign)

- The header is built from `src/lib/menu.ts` and `SiteHeader.tsx`:
  - one row with four mega-menu groups (`MENU_GROUPS`), "Mockup 3D", "Todos os produtos" and the icons;
  - a second row with `EXTRA_TABS` (Crie Sua Festa, Monte Seu Kit, Fachadas).
- That row is at capacity: any change must still fit from 1280 to 1920 px wide without horizontal scroll.
- New features go inside the existing home, header, footer and product page structure.
- Tokens live in `src/app/globals.css` (`@theme`) and primitives in `src/components/ui/`. Never use raw hex in classes. Approved contrast pairs are tested in `src/lib/tokens.test.ts`.

### Internal QA routes (`(interno)`, noindex)

- `/design-system`: tokens and components.
- `/design-system/mockups?kind=…&source=…&p=slug`: every product with its resolved kind, plus a single-viewer inspector.
- `/design-system/mockups/contato`: one viewer that photographs every kind/variant in sequence.
- `/design-system/camiseta?p=&tam=&corpo=&sem=1&lado=back&texto=&verso=&cor=&formato=`: the t-shirt bench for size, body, ghost and back art.
- `/design-system/gabaritos?filtro=&p=slug`: every product's template sizes, mapping and gaps, with the sheets drawn.
- `/design-system/fotos?p=slug&cor=token&modo=pattern|mark&giro=&op=Chave:Valor`: one catalog photo (used by `fotos:novos`).

### New products (site's own API)

- Products Padrão doesn't have yet live in `src/data/novos/fonte.json` and are served by `/api/novos` (categorias/grupos/produtos, Padrão format and filters, plus `parametros` with every attribute). Reserved IDs: category 900000, groups 900001+, variations 9000001+; `catalog-merge.ts` fails the build on any collision.
- They carry `source: "site"`: `groupPrices` never asks the Padrão API for a reseller table, and with real orders on, `priceLine` returns a line error (their variation IDs don't exist in `gerarpedido`). Prices and lead times are reference values for Padrão to validate.
- Their 3D models live in their own files (`cartons.tsx`, `baskets.tsx`, `sacks.tsx`, `seals.tsx`, `jewelry.tsx`, `totem.tsx`, `door-hook.tsx`); the name rules for them sit at the top of `RULES` in `mockup.ts`.
