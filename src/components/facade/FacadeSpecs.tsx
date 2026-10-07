import type { ReactNode } from "react";
import {
  ASPECT_TOLERANCE,
  DPI_MIN,
  DPI_RECOMMENDED,
  EDIT_MAX_SIDE,
  EXAMPLE_SIZES,
  MAX_FILE_MB,
  MAX_PHOTOS,
  MIN_PHOTO_SIDE,
  PRODUCTION_EXTENSIONS,
  facadeLabel,
  formatPixels,
  requiredPixels,
} from "@/lib/facade";
import { IconFile, IconImage, IconStore } from "./icons";

const thousands = (value: number) => value.toLocaleString("pt-BR");
const production = PRODUCTION_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ").replace(/, (\w+)$/, " ou $1");

type Rule = { term: string; detail: ReactNode };

const CARDS: { Icon: typeof IconStore; title: string; lead: string; rules: Rule[] }[] = [
  {
    Icon: IconStore,
    title: "Foto da loja",
    lead: "Para simular. Não vai para a produção.",
    rules: [
      { term: "Formatos", detail: "JPG, PNG ou WEBP (foto HEIC do iPhone: exporte em JPG)" },
      { term: "Tamanho", detail: `Até ${MAX_FILE_MB} MB por foto, até ${MAX_PHOTOS} fotos` },
      { term: "Resolução", detail: `A partir de ${thousands(MIN_PHOTO_SIDE)} px no lado maior; o simulador trabalha com até ${thousands(EDIT_MAX_SIDE)} px` },
      { term: "Como fotografar", detail: "De frente ou um pouco de lado, com a fachada inteira, de dia e sem nada na frente" },
    ],
  },
  {
    Icon: IconImage,
    title: "Design para simular",
    lead: "Aparece na foto e serve de arte final quando tem resolução.",
    rules: [
      { term: "Formatos", detail: `PNG, JPG ou WEBP, até ${MAX_FILE_MB} MB` },
      {
        term: "Resolução",
        detail: `Na medida final: mínimo ${DPI_MIN} DPI (fachada vista a mais de 3 m), recomendado ${DPI_RECOMMENDED} DPI`,
      },
      { term: "Cálculo", detail: "DPI = pixels ÷ (metros × 39,37)" },
      {
        term: "Proporção",
        detail: `A mesma da fachada (até ${Math.round(ASPECT_TOLERANCE * 100)}% de diferença). Fora disso, escolha Preencher (corta o excedente) ou Ajustar (completa com cor de fundo)`,
      },
    ],
  },
  {
    Icon: IconFile,
    title: "Arquivo final de produção",
    lead: "Quando o design é vetor ou maior que 25 MB.",
    rules: [
      { term: "Formatos", detail: `${production} (vetor não perde qualidade), ou imagem dentro das regras ao lado` },
      { term: "Envio", detail: "Depois do pedido, pelo WhatsApp ou pelo reenvio de arte. O simulador não abre esses arquivos" },
      { term: "Medida", detail: "No tamanho final ou em escala (1:10), sempre com a proporção da fachada" },
      { term: "Preparação", detail: "Cores em CMYK, textos em curvas, imagens incorporadas e 5 cm sem texto nas bordas (ilhós, dobra e moldura)" },
    ],
  },
];

/** Regras de arquivo da fachada (as mesmas que o simulador confere), com a tabela de pixels por medida. */
export function FacadeSpecs() {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-coral-700">Arquivos aceitos</p>
      <h2 id="arquivos-titulo" className="mt-3 text-section font-bold">
        Foto, design e arquivo final
      </h2>
      <p className="mt-3 max-w-3xl text-lead text-muted">
        O simulador confere estas regras na hora: formato, tamanho, resolução na medida da fachada e proporção.
      </p>

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {CARDS.map(({ Icon, title, lead, rules }) => (
          <li key={title} className="rounded-card bg-white p-6 shadow-card">
            <span className="grid size-11 place-items-center rounded-full bg-coral-50 text-coral-700">
              <Icon className="size-6" />
            </span>
            <h3 className="mt-4 text-xl font-bold">{title}</h3>
            <p className="mt-1 text-caption text-muted">{lead}</p>
            <dl className="mt-4 grid gap-3 text-[15px]">
              {rules.map((rule) => (
                <div key={rule.term}>
                  <dt className="font-semibold">{rule.term}</dt>
                  <dd className="text-ink/75">{rule.detail}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-card bg-white p-6 shadow-card">
        <h3 className="text-xl font-bold">Pixels necessários por medida</h3>
        <p className="mt-1 text-caption text-muted">Largura × altura do design para cada fachada. Vale para o design em imagem; vetor não tem esse limite.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[15px] tabular-nums">
            <caption className="sr-only">Pixels mínimos e recomendados do design por medida de fachada</caption>
            <thead>
              <tr className="border-b border-line text-caption text-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Fachada
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Mínimo ({DPI_MIN} DPI)
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Recomendado ({DPI_RECOMMENDED} DPI)
                </th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_SIZES.map(([w, h]) => {
                const minimum = requiredPixels(w, h, DPI_MIN);
                const recommended = requiredPixels(w, h, DPI_RECOMMENDED);
                return (
                  <tr key={`${w}x${h}`} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 pr-4 font-semibold">
                      {facadeLabel(w * 100, h * 100)}
                    </th>
                    <td className="py-2.5 pr-4">{formatPixels(minimum.w, minimum.h)}</td>
                    <td className="py-2.5">{formatPixels(recommended.w, recommended.h)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-caption text-muted">Outra medida: multiplique a largura e a altura em metros por 39,37 e pelo DPI.</p>
      </div>
    </div>
  );
}
