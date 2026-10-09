"use client";

import Image from "next/image";
import { useState } from "react";
import { salvarAparencia } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { PALETTES, PALETTE_KEYS, type PaletteKey } from "@/lib/multiloja/core";
import type { Banner } from "@/lib/multiloja/repo";
import { Field, FormMessage, Panel } from "./fields";
import { useFormAction } from "./useFormAction";

type Props = { paleta: PaletteKey; logo: string | null; banners: Banner[]; storeName: string; storeUrl: string };

export default function AparenciaForm({ paleta, logo, banners, storeName, storeUrl }: Props) {
  const { state, submit, pending } = useFormAction(salvarAparencia);
  const [color, setColor] = useState<PaletteKey>(paleta);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const errors = state?.errors ?? {};
  const p = PALETTES[color];
  // Depois de salvar, os campos de arquivo voltam vazios e a lista de banners vem do servidor.
  const formKey = [logo, ...banners.map((b) => b.src)].join("|");

  return (
    <form key={formKey} onSubmit={submit} className="space-y-6" encType="multipart/form-data" noValidate>
      <FormMessage state={state} />

      <Panel title="Cor da marca" description="Muda botões, preços e destaques da loja. As cores já vêm com contraste conferido para leitura." id="cor">
        <div role="radiogroup" aria-label="Cor da marca" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PALETTE_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-control border border-line p-3 has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink"
            >
              <input type="radio" name="paleta" value={key} checked={color === key} onChange={() => setColor(key)} className="sr-only" />
              <span aria-hidden className="size-8 shrink-0 rounded-full" style={{ background: PALETTES[key].main }} />
              <span className="text-[15px] font-bold">{PALETTES[key].name}</span>
            </label>
          ))}
        </div>

        {/* Prévia com a cor escolhida (inline: ainda não foi salva). */}
        <div className="mt-5 rounded-control border border-line p-5">
          <p className="text-caption font-semibold text-muted">Prévia</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="text-[19px] font-bold" style={{ color: p.dark }}>
              R$ 49,90
            </span>
            <span className="inline-flex h-11 items-center rounded-full px-6 text-[19px] font-bold text-white" style={{ background: p.main }}>
              Comprar
            </span>
            <span className="rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: p.soft, color: p.dark }}>
              Lançamento
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Logo" description="PNG com fundo transparente, quadrada, até 2 MB." id="logo">
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid size-24 place-items-center overflow-hidden rounded-card bg-mist">
            {logoPreview || logo ? (
              <Image src={logoPreview ?? (logo as string)} alt="Logo atual" width={96} height={96} unoptimized className="size-24 object-contain" />
            ) : (
              <span aria-hidden className="grid size-16 place-items-center rounded-thumb text-2xl font-black text-white" style={{ background: p.main }}>
                {storeName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <label htmlFor="campo-logo" className="block text-[15px] font-bold">
              {logo ? "Trocar logo" : "Enviar logo"}
            </label>
            <input
              id="campo-logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setLogoPreview(file ? URL.createObjectURL(file) : null);
              }}
              className="block text-[14px] file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-ink file:px-4 file:font-bold file:text-white"
            />
            {logo && (
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" name="removerLogo" className="accent-ink" /> Remover logo
              </label>
            )}
            {errors.logo && <p className="text-caption font-semibold text-coral-700">{errors.logo}</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Banners da página inicial" description="Até 3 imagens horizontais (1920 × 640 px, até 5 MB). Sem banner, a loja mostra o nome e a frase de efeito." id="banners">
        <ul className="space-y-4">
          {banners.map((banner, i) => (
            <li key={banner.src} className="grid gap-4 rounded-control border border-line p-4 md:grid-cols-[240px_1fr]">
              <Image src={banner.src} alt="" width={480} height={160} unoptimized className="aspect-[3/1] w-full rounded-thumb object-cover" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Descrição da imagem" name={`banner_alt_${i}`} defaultValue={banner.alt} maxLength={120} hint="Para quem usa leitor de tela." />
                <Field label="Link (opcional)" name={`banner_link_${i}`} defaultValue={banner.href ?? ""} placeholder="/produtos?categoria=vestuario" hint="Página da própria loja." />
                <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
                  <input type="checkbox" name={`banner_remover_${i}`} className="accent-ink" /> Remover este banner
                </label>
              </div>
            </li>
          ))}
        </ul>
        {banners.length < 3 && (
          <div className={cx("grid gap-3 rounded-control bg-mist p-4 sm:grid-cols-3", banners.length > 0 && "mt-4")}>
            <div>
              <label htmlFor="campo-banner" className="mb-1.5 block text-[15px] font-bold">
                Novo banner
              </label>
              <input
                id="campo-banner"
                name="banner_novo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full text-[14px] file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-ink file:px-4 file:font-bold file:text-white"
              />
              {errors.banner_novo && <p className="mt-1.5 text-caption font-semibold text-coral-700">{errors.banner_novo}</p>}
            </div>
            <Field label="Descrição" name="banner_novo_alt" maxLength={120} />
            <Field label="Link (opcional)" name="banner_novo_link" placeholder="/produtos" />
          </div>
        )}
      </Panel>

      <div className="sticky bottom-4 flex flex-wrap justify-end gap-2">
        <Button href={storeUrl} target="_blank" rel="noreferrer" variant="light" size="md" className="shadow-float">
          Ver loja
        </Button>
        <Button type="submit" size="md" loading={pending} className="shadow-float">
          Salvar aparência
        </Button>
      </div>
    </form>
  );
}
