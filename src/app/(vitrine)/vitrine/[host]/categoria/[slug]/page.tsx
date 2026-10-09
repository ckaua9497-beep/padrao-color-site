import { redirect } from "next/navigation";

/** Link de categoria no formato do site principal: na loja, a categoria é um filtro da lista de produtos. */
export default async function VitrineCategoria(props: PageProps<"/vitrine/[host]/categoria/[slug]">) {
  const { slug } = await props.params;
  redirect(`/produtos?categoria=${encodeURIComponent(slug)}`);
}
