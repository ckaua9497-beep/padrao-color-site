import type { Metadata } from "next";
import FacadeStudio from "@/components/facade/FacadeStudio";
import { FacadeSpecs } from "@/components/facade/FacadeSpecs";
import { IconCorners, IconDownload, IconImage, IconLock, IconRuler, IconStore } from "@/components/facade/icons";
import Faq from "@/components/home/Faq";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { catalogoVivo } from "@/lib/catalogo-vivo";
import { DPI_MIN, DPI_RECOMMENDED, MAX_PHOTOS, buildFacadeMaterials, formatPixels, requiredPixels } from "@/lib/facade";
import { formatBRL, spectrumAt } from "@/lib/format";
import { STORE } from "@/lib/store";

// Catálogo em tempo real (src/lib/catalogo-vivo.ts): só produtos ativos, com os dados de agora; refeita a cada 10 min.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Fachadas: crie a arte e veja a fachada em 3D",
  description:
    "Crie a arte da fachada no editor ou envie a sua e veja na hora numa fachada de loja em 3D ou na foto da sua loja, em perspectiva. Lona, adesivo e placas com preço por m², calculado na hora.",
  openGraph: {
    title: "Simulador de fachadas | Padrão Color",
    description: "Crie ou envie a arte da fachada, veja em 3D ou na foto da sua loja e calcule o preço por m².",
  },
};

const STEPS = [
  { Icon: IconCorners, title: "Informe a medida", text: "Largura e altura da placa: o mockup 3D já mostra a fachada da loja nessa proporção." },
  { Icon: IconImage, title: "Crie ou envie a arte", text: "Escreva o nome da loja e escolha estilo, fonte e cores no editor, ou envie o seu arquivo (PNG, JPG, SVG ou PDF)." },
  { Icon: IconStore, title: "Veja na fachada", text: `Gire a loja em 3D ou envie até ${MAX_PHOTOS} fotos da sua fachada e marque os quatro cantos para ver em perspectiva.` },
  { Icon: IconRuler, title: "Escolha o material", text: "Lona, adesivo ou placa, com preço por m². O arquivo da arte vai junto do pedido." },
];

export default async function FacadesPage() {
  const materials = buildFacadeMaterials((await catalogoVivo()).getProducts());
  const cheapest = materials.length > 0 ? Math.min(...materials.map((m) => m.price)) : null;
  const example = requiredPixels(4, 1, DPI_MIN);

  const highlights = [
    { Icon: IconLock, title: "Arte e fotos ficam no seu navegador", text: "Nada é enviado durante a simulação" },
    { Icon: IconRuler, title: cheapest ? `A partir de ${formatBRL(cheapest)} o m²` : "Preço por m²", text: "Lona, adesivo e placas, calculado na hora" },
    { Icon: IconDownload, title: "Baixe a imagem em PNG", text: "Do 3D ou da foto, para mostrar ao sócio ou ao condomínio" },
  ];

  const faq = [
    {
      q: "Posso criar a fachada sem ter a arte pronta?",
      a: "Pode. No passo 2, escreva o nome da loja e um texto secundário (telefone, @perfil) e escolha um dos estilos prontos, a fonte e as cores: a placa do mockup 3D muda na hora. Também dá para enviar o seu logo e posicionar no editor. A equipe confere o arquivo antes de imprimir.",
    },
    {
      q: "A arte e as fotos são enviadas para o site?",
      a: "Durante a simulação, não: o editor, o mockup 3D e a simulação na foto rodam no seu navegador, e as fotos da loja nunca saem do seu aparelho. O arquivo da arte só vai quando você finaliza a compra, junto do pedido, para a equipe conferir antes de imprimir.",
    },
    {
      q: "Que resolução o design precisa ter?",
      a: `Na medida final, pelo menos ${DPI_MIN} DPI (fachada vista a mais de 3 m) e, de preferência, ${DPI_RECOMMENDED} DPI. Uma fachada de 4 × 1 m pede no mínimo ${formatPixels(example.w, example.h)}. Arquivos em vetor (PDF, AI, CDR) não têm esse limite.`,
    },
    {
      q: "E se a minha arte tiver outra proporção?",
      a: "O editor encaixa o arquivo na placa sozinho: logo inteiro e centralizado, sobre a cor da borda dele; foto preenchendo a área. Depois você escolhe entre Preencher a área e Imagem inteira, arrasta, aumenta e troca a cor de fundo.",
    },
    {
      q: "Como o preço é calculado?",
      a: "Largura × altura, em m², vezes o preço por m² do material e do acabamento escolhidos. Materiais com área mínima cobram a área mínima. O frete aparece na finalização da compra.",
    },
    {
      q: "A fachada é maior que a placa. E agora?",
      a: "Placas rígidas têm medida máxima, que aparece no cartão de cada material. Lona e adesivo saem em rolo: escolha um deles ou fale com a equipe para dividir a fachada em partes.",
    },
    {
      q: "A simulação é igual à fachada pronta?",
      a: "O mockup 3D e a simulação na foto são prévias para decidir: a loja do 3D é ilustrativa, a perspectiva, a luz e a sombra são aproximadas e as cores mudam de tela para tela. A impressão segue o arquivo final, que a equipe confere antes de imprimir.",
    },
  ];

  return (
    <>
      <div className="container-site pb-16 pt-8">
        <Breadcrumb
          items={[
            { href: "/", label: "Início" },
            { label: "Fachadas" },
          ]}
        />

        <header className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Simulador de fachadas</p>
            <h1 className="mt-3 text-display">Crie a fachada e veja na loja antes de imprimir</h1>
            <p className="mt-4 max-w-2xl text-lead text-muted">
              Monte a arte no editor (nome, estilo, fonte e cores) ou envie a sua, e veja na hora numa fachada de loja em 3D. Se quiser, aplique na foto da sua loja, em
              perspectiva. O preço sai na hora, por m² do material.
            </p>
          </div>
          <ul className="grid gap-2 sm:gap-3">
            {highlights.map(({ Icon, title, text }, i) => (
              <li key={title} className="flex items-center gap-3 rounded-card bg-mist p-3 sm:p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full sm:size-11" style={{ background: spectrumAt(i + 1).soft }}>
                  <Icon className="size-5" />
                </span>
                <span className="text-caption leading-tight">
                  <span className="block text-[15px] font-bold">{title}</span>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </header>

        <section aria-labelledby="simulador-titulo" className="mt-12">
          <h2 id="simulador-titulo" className="sr-only">
            Simulador
          </h2>
          {materials.length > 0 ? (
            <FacadeStudio materials={materials} />
          ) : (
            <div className="rounded-card border border-line-strong p-10 text-center">
              <p className="text-lg font-semibold">O simulador está fora do ar no momento.</p>
              <p className="mt-2 text-muted">
                Nenhum material de fachada está disponível no catálogo agora. Fale com a equipe pelo{" "}
                <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
                  WhatsApp
                </a>
                .
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Faixa de fundo cinza: pela âncora, ela encosta logo abaixo do topo preso (92 px; 136 a partir de 1280). */}
      <section id="arquivos-aceitos" aria-labelledby="arquivos-titulo" className="scroll-mt-topo bg-mist">
        <div className="container-site py-16">
          <FacadeSpecs />
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="container-site py-16">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Como funciona</p>
        <h2 id="como-funciona" className="mt-3 text-section font-bold">
          Da foto ao pedido em quatro passos
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className="rounded-card p-6" style={{ background: spectrumAt(i).soft }}>
              <span className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-full bg-white">
                  <Icon className="size-5" />
                </span>
                <span aria-hidden className="text-3xl font-black text-ink/15">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-[15px] text-ink/75">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fachada-faq" className="bg-cloud">
        <div className="container-site grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Dúvidas</p>
            <h2 id="fachada-faq" className="mt-3 text-section font-bold">
              Perguntas frequentes
            </h2>
            <p className="mt-3 text-muted">
              Ficou alguma dúvida? Fale com a equipe pelo{" "}
              <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
                WhatsApp
              </a>{" "}
              ({STORE.hours.toLowerCase()}).
            </p>
          </div>
          <Faq items={faq} />
        </div>
      </section>
    </>
  );
}
