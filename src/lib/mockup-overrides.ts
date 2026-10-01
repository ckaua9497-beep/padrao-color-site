import type { MockupKind } from "./mockup-kinds.ts";

export type MockupOverride = {
  kind?: MockupKind;
  /** Força "vendido sem impressão" (true) ou "impresso" (false). */
  blank?: boolean;
  /** Força o subtipo do modelo (ver VARIANTS em mockup.ts). */
  variant?: string;
};

// Ajustes por slug para produtos que as regras de nome e categoria não resolvem bem.
// Um teste garante que todo slug daqui continua existindo no catálogo.
export const MOCKUP_OVERRIDES: Record<string, MockupOverride> = {
  // Lixeira de carro em tecido: a forma mais próxima é uma bolsa pendurada.
  "242-lixeira-pet-p-automoveis": { kind: "bag", variant: "car-trash" },
};
