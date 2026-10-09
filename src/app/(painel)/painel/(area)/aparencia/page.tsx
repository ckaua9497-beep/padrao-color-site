import type { Metadata } from "next";
import AparenciaForm from "@/components/painel/AparenciaForm";
import { requirePainel } from "@/lib/multiloja/auth";
import { lojaUrl } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Aparência" };

export default async function PainelAparencia() {
  const { loja } = await requirePainel();
  return (
    <div className="space-y-6">
      <h1 className="text-title">Aparência</h1>
      <AparenciaForm paleta={loja.paleta} logo={loja.logo} banners={loja.banners} storeName={loja.nome} storeUrl={await lojaUrl(loja)} />
    </div>
  );
}
