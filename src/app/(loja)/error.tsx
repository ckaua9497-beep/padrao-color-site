"use client";

import Link from "next/link";
import { useEffect } from "react";
import { STORE } from "@/lib/catalog";

export default function LojaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-coral-700">Algo deu errado</p>
      <h1 className="mt-3 text-3xl font-bold text-balance">Não conseguimos mostrar esta página agora.</h1>
      <p className="mt-3 text-muted">
        Tente de novo. Se o problema continuar, fale com a gente pelo{" "}
        <a href={STORE.whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-2">
          WhatsApp
        </a>
        .
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={retry} className="h-12 rounded-full bg-ink px-6 font-bold text-white transition-colors hover:bg-coral-700">
          Tentar de novo
        </button>
        <Link href="/" className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 font-bold hover:border-ink">
          Voltar para a loja
        </Link>
      </div>
    </div>
  );
}
