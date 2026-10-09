import type { Metadata } from "next";
import PreviaLoja from "@/components/painel/editor/PreviaLoja";
import { requirePainel } from "@/lib/multiloja/auth";
import { formatPhone, whatsappLink } from "@/lib/multiloja/core";
import { vitrineDados } from "@/lib/multiloja/vitrine";

export const metadata: Metadata = { title: "Prévia da loja" };

/** Página que o editor "Personalizar loja" mostra no iframe: a página inicial da loja com o tema em edição. */
export default async function PainelPrevia() {
  const { loja } = await requirePainel();
  const dados = await vitrineDados(loja);
  return (
    <PreviaLoja
      inicial={loja.temaRascunho ?? loja.tema}
      dados={dados}
      rodape={{
        year: Number(loja.atualizadoEm.slice(0, 4)) || 2026,
        about: loja.sobre,
        whatsapp: loja.whatsapp ? { href: whatsappLink(loja.whatsapp, `Olá! Vim pela loja ${loja.nome}.`), label: formatPhone(loja.whatsapp) } : null,
        phone: loja.telefone ? formatPhone(loja.telefone) : null,
        email: loja.emailContato,
        socials: loja.redes,
      }}
    />
  );
}
