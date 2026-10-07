import type { Metadata } from "next";
import FacadeStudio from "@/components/facade/FacadeStudio";
import { FacadeSpecs } from "@/components/facade/FacadeSpecs";
import { IconCorners, IconDownload, IconImage, IconLock, IconRuler, IconStore } from "@/components/facade/icons";
import Faq from "@/components/home/Faq";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getProducts } from "@/lib/catalog";
import { DPI_MIN, DPI_RECOMMENDED, MAX_PHOTOS, buildFacadeMaterials, formatPixels, requiredPixels } from "@/lib/facade";
import { formatBRL, spectrumAt } from "@/lib/format";
import { STORE } from "@/lib/store";

export const metadata: Metadata = {
  title: "Fachadas: simule a fachada na foto da sua loja",
  description:
    "Envie a foto da sua loja, marque onde a fachada entra e veja o seu design aplicado em perspectiva. Lona, adesivo e placas com preço por m², calculado na hora.",
  openGraph: {
    title: "Simulador de fachadas | Padrão Color",
    description: "Veja o design da fachada aplicado na foto da sua loja, em perspectiva, e calcule o preço por m².",
  },
};

const STEPS = [
  { Icon: IconStore, title: "Fotografe a fachada", text: `De frente ou um pouco de lado, com a fachada inteira. Envie até ${MAX_PHOTOS} fotos e compare.` },
  { Icon: IconCorners, title: "Marque os quatro cantos", text: "Arraste os cantos até as bordas: o design entra em perspectiva, com a luz e a sombra da foto." },
  { Icon: IconImage, title: "Envie o design", text: "PNG, JPG ou WEBP para simular. O simulador confere a resolução na medida real." },
  { Icon: IconRuler, title: "Escolha o material", text: "Lona, adesivo ou placa, com preço por m². O arquivo final vai depois do pedido." },
];

export default function FacadesPage() {
  const materials = buildFacadeMaterials(getProducts());
  const cheapest = materials.length > 0 ? Math.min(...materials.map((m) => m.price)) : null;
  const example = requiredPixels(4, 1, DPI_MIN);

  const highlights = [
    { Icon: IconLock, title: "Fotos e design ficam no seu navegador", text: "Nada é enviado durante a simulação" },
    { Icon: IconRuler, title: cheapest ? `A partir de ${formatBRL(cheapest)} o m²` : "Preço por m²", text: "Lona, adesivo e placas, calculado na hora" },
    { Icon: IconDownload, title: "Baixe a simulação em PNG", text: "Para mostrar ao sócio ou ao condomínio" },
  ];

  const faq = [
    {
      q: "A foto e o design são enviados para o site?",
      a: "Não. O simulador roda no seu navegador: as fotos da loja e o design não saem do seu aparelho. O arquivo final vai depois do pedido, pelo WhatsApp ou pelo reenvio de arte.",
    },
    {
      q: "Que resolução o design precisa ter?",
      a: `Na medida final, pelo menos ${DPI_MIN} DPI (fachada vista a mais de 3 m) e, de preferência, ${DPI_RECOMMENDED} DPI. Uma fachada de 4 × 1 m pede no mínimo ${formatPixels(example.w, example.h)}. Arquivos em vetor (PDF, AI, CDR) não têm esse limite.`,
    },
    {
      q: "E se o design tiver outra proporção?",
      a: "O simulador mostra a diferença e você escolhe: Preencher ocupa a fachada toda e corta o excedente; Ajustar mostra o design inteiro e completa a sobra com uma cor de fundo.",
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
      a: "É uma prévia para decidir: perspectiva, luz e sombra são aproximadas e as cores mudam de tela para tela. A impressão segue o arquivo final, que a equipe confere antes de imprimir.",
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
            <h1 className="mt-3 text-display">Veja a fachada nova na foto da sua loja</h1>
            <p className="mt-4 max-w-2xl text-lead text-muted">
              Envie uma foto da frente da loja, marque os quatro cantos da fachada e veja o seu design aplicado em perspectiva, com a luz da foto. O preço sai na hora, por m² do
              material.
            </p>
          </div>
          <ul className="grid gap-3">
            {highlights.map(({ Icon, title, text }, i) => (
              <li key={title} className="flex items-center gap-3 rounded-card bg-mist p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: spectrumAt(i + 1).soft }}>
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

      <section id="arquivos-aceitos" aria-labelledby="arquivos-titulo" className="scroll-mt-28 bg-mist">
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
