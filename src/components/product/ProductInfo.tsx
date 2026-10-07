"use client";

import { useState, type ReactNode } from "react";
import { AccordionItem } from "@/components/ui/Accordion";
import { cx } from "@/components/ui/cx";
import type { InfoBlock } from "@/lib/catalog";

type Props = {
  /** Blocos de "informacao" de GET /grupos (Informações técnicas, Tabela de medidas, papéis…). */
  info: InfoBlock[];
  /** Opções do configurador, para o item "Opções disponíveis". */
  options: { label: string; values: string[] }[];
  variationCount: number;
  className?: string;
};

type Table = { columns: string[]; rows: string[][]; notes: string[] };

// "- P: Largura 50 cm | Comprimento 68 cm | Manga 35,5 cm"
const ROW = /^[-•*]?\s*([^:|]{1,24}):\s*(.+\|.+)$/;
const CELL = /^\s*([^\d|]+?)\s+([\d.,]+\s*[a-zA-Zº°²%]*)\s*[.;]?\s*$/;

/** Linhas "Tamanho: Largura X | Comprimento Y" viram tabela (a "Tabela de Medidas" da API). */
function parseTable(lines: string[]): Table | null {
  const rows: string[][] = [];
  const notes: string[] = [];
  let columns: string[] | null = null;
  for (const line of lines) {
    const match = ROW.exec(line);
    const cells = match?.[2].split("|").map((cell) => CELL.exec(cell));
    if (!match || !cells || cells.some((c) => !c)) {
      notes.push(line);
      continue;
    }
    const keys = cells.map((c) => c![1].trim());
    columns ??= keys;
    if (keys.join("|") !== columns.join("|")) return null;
    rows.push([match[1].trim(), ...cells.map((c) => c![2].trim())]);
  }
  if (!columns || rows.length < 2) return null;
  return { columns: ["Tamanho", ...columns], rows, notes };
}

const PAIR = /^[-•*]?\s*([^:]{2,40}):\s+(.+)$/;
const BULLET = /^[-•*]\s+/;

/** Texto da API em tabela, lista de pares (Material: …), lista ou parágrafos. */
function InfoText({ text }: { text: string }) {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const table = parseTable(lines);
  if (table) {
    return (
      <div>
        {table.notes.map((note) => (
          <p key={note} className="mb-2 text-[15px] text-ink/80">
            {note}
          </p>
        ))}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left text-[15px] tabular-nums">
            <thead>
              <tr className="border-b border-line-strong">
                {table.columns.map((column) => (
                  <th key={column} scope="col" className="py-2 pr-4 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row[0]} className="border-b border-line last:border-0">
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-2 pr-4 font-semibold">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="py-2 pr-4 text-ink/80">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const pairs = lines.map((line) => PAIR.exec(line));
  if (lines.length > 1 && pairs.every(Boolean)) {
    return (
      <dl className="grid gap-x-4 gap-y-2 text-[15px] sm:grid-cols-[minmax(120px,auto)_1fr]">
        {pairs.map((pair, i) => (
          <div key={i} className="contents">
            <dt className="font-semibold">{pair![1].trim()}</dt>
            <dd className="text-ink/80">{pair![2].trim()}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (lines.length > 1 && lines.every((line) => BULLET.test(line))) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink/80">
        {lines.map((line, i) => (
          <li key={i}>{line.replace(BULLET, "")}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-ink/80">
      {text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

/** "Informações Técnicas:" → "Informações técnicas" (sem os dois pontos; o resto como veio). */
function cleanTitle(title: string): string {
  return title.replace(/:\s*$/, "").trim();
}

/** Acordeão "Sobre o produto": blocos de informação da API e as opções do configurador. */
export default function ProductInfo({ info, options, variationCount, className }: Props) {
  const items: { title: string; body: ReactNode }[] = [
    ...info.map((block) => ({ title: cleanTitle(block.title), body: <InfoText text={block.text} /> })),
    ...(options.length
      ? [
          {
            title: "Opções disponíveis",
            body: (
              <dl className="grid gap-x-4 gap-y-2 text-[15px] sm:grid-cols-[minmax(120px,auto)_1fr]">
                {options.map((option) => (
                  <div key={option.label} className="contents">
                    <dt className="font-semibold">{option.label}</dt>
                    <dd className="text-ink/80">{option.values.join(" · ")}</dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="font-semibold">Combinações</dt>
                  <dd className="text-ink/80">{variationCount} com preço e prazo</dd>
                </div>
              </dl>
            ),
          },
        ]
      : []),
  ];
  const [open, setOpen] = useState(0);

  if (!items.length) return null;
  return (
    <div className={cx("divide-y divide-line rounded-card bg-white px-5", className)}>
      {items.map((item, i) => (
        <AccordionItem key={`${item.title}-${i}`} title={<span className="text-[17px] font-bold">{item.title}</span>} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} buttonClassName="py-4">
          <div className="pb-5">{item.body}</div>
        </AccordionItem>
      ))}
    </div>
  );
}
