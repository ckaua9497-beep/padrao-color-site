import PainelNav from "@/components/painel/PainelNav";
import { requirePainel } from "@/lib/multiloja/auth";
import { lojaUrl } from "@/lib/multiloja/tenant";

export default async function PainelAreaLayout({ children }: { children: React.ReactNode }) {
  const { lojista, loja } = await requirePainel();
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <PainelNav storeName={loja.nome} ownerName={lojista.nome} storeUrl={await lojaUrl(loja)} />
      <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
