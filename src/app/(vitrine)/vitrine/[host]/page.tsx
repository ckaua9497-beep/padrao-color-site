import { notFound } from "next/navigation";
import SecoesLoja from "@/components/vitrine/loja/Secoes";
import { lojaDoHost } from "@/lib/multiloja/tenant";
import { vitrineDados } from "@/lib/multiloja/vitrine";

/** Página inicial da loja: as seções do tema publicado no "Personalizar loja", na ordem que o lojista escolheu. */
export default async function VitrineHome(props: PageProps<"/vitrine/[host]">) {
  const { host } = await props.params;
  const loja = await lojaDoHost(host);
  if (!loja) notFound();
  return <SecoesLoja tema={loja.tema} dados={await vitrineDados(loja)} />;
}
