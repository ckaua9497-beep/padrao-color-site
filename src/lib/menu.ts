// Grupos do mega menu: categorias, texto de apoio e benefícios (ícone + título + linha de apoio),
// como o mega menu da Tapz (foto + benefícios).

export type BenefitIcon = "cube" | "clock" | "layers" | "shield" | "truck" | "upload" | "headset";

export type MenuBenefit = { icon: BenefitIcon; title: string; text: string };

export const MENU_GROUPS = [
  {
    label: "Papelaria",
    blurb: "Cartões, folhetos, adesivos e tudo que vai para o papel.",
    categories: ["cartoes-de-visita-e-postais", "folhetos", "adesivos-e-rotulos", "calendarios", "escritorio", "impressoes", "photobook"],
    benefits: [
      { icon: "cube", title: "Mockup 3D grátis", text: "Veja a arte antes de imprimir" },
      { icon: "clock", title: "Produção rápida", text: "A partir de 2 dias úteis" },
      { icon: "layers", title: "Papéis especiais", text: "Couchê, supremo e reciclado" },
      { icon: "shield", title: "Acabamentos", text: "Verniz local e laminação" },
    ],
  },
  {
    label: "Comunicação Visual",
    blurb: "Banners, placas, LED neon e sinalização para a sua marca aparecer.",
    categories: ["banner-e-lonas", "comunicacao-visual", "led-neon", "promocional", "festas-e-eventos"],
    benefits: [
      { icon: "layers", title: "Medida sob medida", text: "Lona, PVC, PS e acrílico" },
      { icon: "shield", title: "Pronto para instalar", text: "Ilhós, bastão e corda" },
      { icon: "cube", title: "LED neon", text: "Sua frase com a cor do LED" },
      { icon: "truck", title: "Entrega para todo o Brasil", text: "Frete calculado no checkout" },
    ],
  },
  {
    label: "Brindes e Vestuário",
    blurb: "Canecas, camisas, almofadas e presentes com a sua arte.",
    categories: ["brindes-e-presentes", "vestuario", "texteis", "bolsas-e-mochilas", "casa-e-decoracao", "pet-shop"],
    benefits: [
      { icon: "upload", title: "Texto ou logo", text: "Aparece no mockup na hora" },
      { icon: "layers", title: "Sublimação e DTF", text: "Cores vivas que não saem" },
      { icon: "cube", title: "A partir de 1 unidade", text: "Presente único ou em lote" },
      { icon: "shield", title: "Cor da peça à escolha", text: "Camisa, boné, caneca e garrafa" },
    ],
  },
  {
    label: "Para o seu negócio",
    blurb: "Itens para restaurantes, embalagens e insumos de personalização.",
    categories: ["restaurantes", "embalagens", "suprimentos"],
    benefits: [
      { icon: "headset", title: "Atendimento comercial", text: "Seg a sex, das 8h às 18h" },
      { icon: "layers", title: "Insumos de sublimação", text: "Canecas, garrafas e papéis" },
      { icon: "shield", title: "Seja revendedor", text: "Condições especiais" },
      { icon: "truck", title: "Pedido recorrente", text: "Reposição sem complicação" },
    ],
  },
] as const satisfies readonly { label: string; blurb: string; categories: readonly string[]; benefits: readonly MenuBenefit[] }[];
