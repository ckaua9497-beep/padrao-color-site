"use client";

import { useState } from "react";
import { salvarLoja } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/Button";
import { MARGIN_MAX, MARGIN_MIN, SOCIAL_KEYS, SOCIAL_LABEL, formatPhone, type SocialKey } from "@/lib/multiloja/core";
import { useFormAction } from "./useFormAction";
import { Field, FormMessage, Panel, TextArea } from "./fields";

export type LojaFormData = {
  nome: string;
  slogan: string;
  sobre: string;
  subdominio: string;
  whatsapp: string | null;
  telefone: string | null;
  emailContato: string | null;
  redes: Partial<Record<SocialKey, string>>;
  margemPadrao: number;
  categoriasDestaque: string[];
  freteFixo: number;
  freteGratisAcima: number | null;
};

const money = (value: number | null) => (value === null || value === 0 ? "" : value.toFixed(2).replace(".", ","));

const SOCIAL_HINT: Record<SocialKey, string> = {
  instagram: "@seuperfil ou link",
  tiktok: "@seuperfil ou link",
  youtube: "https://youtube.com/@seucanal",
  facebook: "https://facebook.com/sualoja",
  pinterest: "https://pinterest.com/sualoja",
  linkedin: "https://linkedin.com/company/sualoja",
};

export default function LojaForm({ loja, categories, domainSuffix }: { loja: LojaFormData; categories: { slug: string; name: string }[]; domainSuffix: string }) {
  const { state, submit, pending } = useFormAction(salvarLoja);
  const [featured, setFeatured] = useState<string[]>(loja.categoriasDestaque);
  const errors = state?.errors ?? {};

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <FormMessage state={state} />

      <Panel title="Identidade" id="identidade">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Nome da loja" name="nome" defaultValue={loja.nome} required maxLength={60} error={errors.nome} />
          <div>
            <label htmlFor="campo-subdominio" className="mb-1.5 block text-[15px] font-bold">
              Endereço da loja
            </label>
            <div className="flex h-12 items-center overflow-hidden rounded-control border border-line bg-white focus-within:border-ink">
              <input id="campo-subdominio" name="subdominio" defaultValue={loja.subdominio} maxLength={30} spellCheck={false} autoComplete="off" aria-describedby="subdominio-dica" className="h-full min-w-0 flex-1 px-4 text-body outline-none" />
              <span className="shrink-0 pr-4 text-[14px] text-muted">{domainSuffix}</span>
            </div>
            <p id="subdominio-dica" className={errors.subdominio ? "mt-1.5 text-caption font-semibold text-coral-700" : "mt-1.5 text-caption text-muted"}>
              {errors.subdominio ?? "Se mudar, o link antigo para de funcionar."}
            </p>
          </div>
          <Field className="md:col-span-2" label="Frase de efeito" name="slogan" defaultValue={loja.slogan} maxLength={120} hint="Aparece no topo da página inicial e no Google." />
          <TextArea className="md:col-span-2" label="Sobre a loja" name="sobre" defaultValue={loja.sobre} maxLength={2000} rows={6} hint="Conte quem você é e o que a loja oferece. Vai para a página Sobre." />
        </div>
      </Panel>

      <Panel title="Atendimento" description="Os pedidos da loja chegam pelo WhatsApp." id="atendimento">
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" defaultValue={loja.whatsapp ? formatPhone(loja.whatsapp) : ""} placeholder="(00) 00000-0000" error={errors.whatsapp} />
          <Field label="Telefone (opcional)" name="telefone" type="tel" inputMode="tel" defaultValue={loja.telefone ? formatPhone(loja.telefone) : ""} error={errors.telefone} />
          <Field label="E-mail de contato" name="emailContato" type="email" defaultValue={loja.emailContato ?? ""} error={errors.emailContato} />
        </div>
      </Panel>

      <Panel title="Margem padrão" description={`Vale para todo produto ativo sem margem própria. Mínimo ${MARGIN_MIN}%, máximo ${MARGIN_MAX}%.`} id="margem">
        <Field className="max-w-48" label="Margem (%)" name="margemPadrao" inputMode="decimal" defaultValue={String(loja.margemPadrao)} error={errors.margemPadrao} />
      </Panel>

      <Panel title="Frete" description="Valor cobrado do cliente por pedido. Ele é repassado para a entrega e não entra na sua comissão. Deixe em branco para frete grátis." id="frete">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Frete por pedido (R$)" name="freteFixo" inputMode="decimal" defaultValue={money(loja.freteFixo)} placeholder="Grátis" error={errors.freteFixo} />
          <Field label="Grátis a partir de (R$)" name="freteGratisAcima" inputMode="decimal" defaultValue={money(loja.freteGratisAcima)} placeholder="Opcional" error={errors.freteGratisAcima} hint="Subtotal dos produtos." />
        </div>
      </Panel>

      <Panel title="Categorias em destaque" description={`Escolha até 8. Elas aparecem primeiro no menu da loja (${featured.length}/8).`} id="categorias">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const checked = featured.includes(c.slug);
            return (
              <label key={c.slug} className="cursor-pointer rounded-full border border-line px-4 py-2 text-[14px] font-semibold has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white has-[:disabled]:opacity-50">
                <input
                  type="checkbox"
                  name="categorias"
                  value={c.slug}
                  checked={checked}
                  disabled={!checked && featured.length >= 8}
                  onChange={() => setFeatured((list) => (checked ? list.filter((s) => s !== c.slug) : [...list, c.slug]))}
                  className="sr-only"
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </Panel>

      <Panel title="Redes sociais" description="Ficam no rodapé e na página Sobre." id="redes">
        <div className="grid gap-5 md:grid-cols-2">
          {SOCIAL_KEYS.map((key) => (
            <Field key={key} label={SOCIAL_LABEL[key]} name={`rede_${key}`} defaultValue={loja.redes[key] ?? ""} placeholder={SOCIAL_HINT[key]} error={errors[`rede_${key}`]} />
          ))}
        </div>
      </Panel>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="md" loading={pending} className="shadow-float">
          Salvar dados da loja
        </Button>
      </div>
    </form>
  );
}
