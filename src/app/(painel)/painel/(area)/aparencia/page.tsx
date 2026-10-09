import { redirect } from "next/navigation";

/** A antiga tela "Aparência" virou o editor "Personalizar loja" (logo, cor, banners e muito mais). */
export default function PainelAparencia() {
  redirect("/painel/personalizar");
}
