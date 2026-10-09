import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VitrineCheckout from "@/components/vitrine/VitrineCheckout";
import { lojaDoHost } from "@/lib/multiloja/tenant";

export const metadata: Metadata = { title: "Finalizar pedido", robots: { index: false } };

export default async function VitrineFinalizar(props: PageProps<"/vitrine/[host]/checkout">) {
  const { host } = await props.params;
  const loja = lojaDoHost(host);
  if (!loja) notFound();
  return (
    <div className="bg-page-checkout">
      <div className="container-site py-12">
        <h1 className="mb-8 text-section font-bold">Finalizar pedido</h1>
        <VitrineCheckout storeName={loja.nome} whatsapp={loja.whatsapp} email={loja.emailContato} />
      </div>
    </div>
  );
}
