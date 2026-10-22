import type { Metadata } from "next";
import { Suspense } from "react";
import KitBuilder from "@/components/kit/KitBuilder";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getProducts } from "@/lib/catalog";
import { produtosComMidia } from "@/lib/midia";
import { midiaDoSite } from "@/lib/midia-servidor";
import { resolveKitCatalog } from "@/lib/kit-builder";

/*
 * Monte o seu kit: o assistente (para que é, quantos kits, quanto investir e o que não pode faltar) e o kit
 * montado, com o valor por kit e o total calculados item a item. `?objetivo=boas-vindas` começa na segunda
 * pergunta (os cards da página do Monte Seu Kit levam para cá).
 */

export const metadata: Metadata = {
  title: "Monte o seu kit",
  description:
    "Conte para que é o kit, quantos você precisa e quanto quer investir: sugerimos produtos reais dentro do orçamento e você ajusta, busca outros no catálogo e vê o valor por kit e o total na hora.",
};

function BuilderSkeleton() {
  return (
    <div aria-hidden className="mx-auto max-w-5xl rounded-card bg-white p-5 shadow-card ring-1 ring-line sm:p-8 lg:p-10">
      <div className="h-4 w-40 rounded-full bg-mist" />
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 rounded-full bg-line" />
        ))}
      </div>
      <div className="mt-7 h-9 w-2/3 rounded-control bg-mist" />
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-card bg-mist" />
        ))}
      </div>
    </div>
  );
}

export default async function MontarKitPage() {
  const catalog = resolveKitCatalog(produtosComMidia(getProducts(), await midiaDoSite()));
  return (
    <div className="container-site pb-20 pt-8">
      <Breadcrumb
        className="mb-6"
        items={[
          { href: "/", label: "Início" },
          { href: "/monte-seu-kit", label: "Monte Seu Kit" },
          { label: "Monte o seu" },
        ]}
      />
      <h1 className="sr-only">Monte o seu kit</h1>
      <Suspense fallback={<BuilderSkeleton />}>
        <KitBuilder catalog={catalog} />
      </Suspense>
    </div>
  );
}
