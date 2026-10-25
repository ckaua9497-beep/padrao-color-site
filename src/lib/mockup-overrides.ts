import type { MockupKind } from "./mockup-kinds.ts";

export type MockupOverride = {
  kind?: MockupKind;
  /** Força "vendido sem impressão" (true) ou "impresso" (false). */
  blank?: boolean;
  /** Força o subtipo do modelo (ver VARIANTS em mockup.ts). */
  variant?: string;
  /** Cor das alças, debruns ou detalhes quando a opção não diz (a da foto do produto). */
  accentColor?: string;
  /** Cor da peça quando a opção não diz (a da foto do produto). */
  baseColor?: string;
};

// Ajustes por slug para produtos que as regras de nome e categoria não resolvem bem.
// Um teste garante que todo slug daqui continua existindo no catálogo.
export const MOCKUP_OVERRIDES: Record<string, MockupOverride> = {
  // Lixeira de carro em tecido: a forma mais próxima é uma bolsa pendurada.
  "242-lixeira-pet-p-automoveis": { kind: "bag", variant: "car-trash" },
  // Ecobag branca com alça de fita preta, como na foto do produto (revisão da Padrão de 25/10/2026).
  "48-ecobag-personalizada": { accentColor: "#1b1b1e" },
  // Bolsa esportiva de náilon preto com a arte DTF na lateral.
  "478-bolsa-esportiva-de-mao": { baseColor: "#232427" },
  // Lancheira impressa inteira com alça e vivo brancos (revisão da Padrão de 25/10/2026).
  "100-lancheira-brinde": { accentColor: "#f5f5f3" },
};
