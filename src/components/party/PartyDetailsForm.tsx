"use client";

import { OptionGroup } from "@/components/ui/OptionGroup";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/components/ui/cx";
import { PARTY_PALETTES, PARTY_TYPES, getPalette, getPartyType, type PartyDetails } from "@/lib/party";
import { PalettePicker } from "./PalettePicker";

type Props = {
  details: PartyDetails;
  onChange: (patch: Partial<PartyDetails>) => void;
  /** Prefixo dos ids dos campos (o nome fica em `${idPrefix}-nome`). */
  idPrefix: string;
  /** Mostra a escolha do tipo de festa (no kit o tipo já vem definido). */
  chooseType?: boolean;
  nameError?: boolean;
  /** Nota abaixo da data (dias úteis até a festa). */
  dateNote?: string | null;
};

/** O que vale para a festa toda: tipo, tema, nome, idade ou data, paleta e frase da arte. */
export function PartyDetailsForm({ details, onChange, idPrefix, chooseType = false, nameError = false, dateNote }: Props) {
  const type = getPartyType(details.type);
  const palette = getPalette(details.palette);

  return (
    <div className="grid gap-7">
      {chooseType && (
        <div>
          <p className="mb-2.5 text-[15px] font-bold">Tipo de festa</p>
          <OptionGroup label="Tipo de festa" value={details.type} onChange={(value) => onChange({ type: value })} options={PARTY_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
      )}

      <TextField
        id={`${idPrefix}-nome`}
        label={type.nameLabel}
        value={details.name}
        onChange={(name) => onChange({ name })}
        maxLength={40}
        placeholder={type.namePlaceholder}
        autoComplete="off"
        required
        hint="Vai em destaque em todos os itens."
        error={nameError ? "Escreva o nome para continuar." : null}
      />

      <div>
        <TextField
          id={`${idPrefix}-tema`}
          label="Tema (opcional)"
          value={details.theme}
          onChange={(theme) => onChange({ theme })}
          maxLength={40}
          placeholder={`Ex.: ${type.themes[0] ?? "Tropical"}`}
          autoComplete="off"
        />
        {type.themes.length > 0 && (
          <div role="group" aria-label="Sugestões de tema" className="mt-2.5 flex flex-wrap gap-2">
            {type.themes.map((theme) => {
              const active = details.theme === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ theme: active ? "" : theme })}
                  className={cx(
                    "min-h-9 rounded-full px-3.5 text-[13px] font-semibold ring-1 transition-colors duration-200",
                    active ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line-strong hover:ring-ink",
                  )}
                >
                  {theme}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-idade`}
          label="Idade ou marco (opcional)"
          value={details.age}
          onChange={(age) => onChange({ age })}
          maxLength={24}
          placeholder={type.agePlaceholder}
          autoComplete="off"
        />
        <TextField
          id={`${idPrefix}-data`}
          type="date"
          label="Data da festa (opcional)"
          value={details.date}
          onChange={(date) => onChange({ date })}
          hint={dateNote ?? "Ajuda a conferir o prazo de produção."}
        />
      </div>

      <div>
        <p className="mb-2.5 text-[15px] font-bold">
          Paleta de cores <span className="font-normal text-muted">· {palette.label}</span>
        </p>
        <PalettePicker palettes={PARTY_PALETTES} value={details.palette} onChange={(id) => onChange({ palette: id })} />
      </div>

      <TextField
        id={`${idPrefix}-frase`}
        label="Frase da arte (opcional)"
        value={details.phrase}
        onChange={(phrase) => onChange({ phrase })}
        maxLength={60}
        placeholder={type.phrasePlaceholder}
        autoComplete="off"
        hint="Entra nos itens que levam texto, como painel, convites e tags."
      />
    </div>
  );
}
