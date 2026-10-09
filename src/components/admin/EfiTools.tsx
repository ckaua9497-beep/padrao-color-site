"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { efiCadastrarWebhook, efiConsultarTeste, efiPixTeste, type AdminResult } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/Button";

/** Botões da página de pagamentos: testar de novo, cadastrar o webhook e (homologação) fazer um Pix de teste. */
export default function EfiTools({ sandbox, canRegister }: { sandbox: boolean; canRegister: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [test, setTest] = useState<{ txid: string; pixCode?: string; pixImage?: string } | null>(null);
  const [testStatus, setTestStatus] = useState<AdminResult | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => router.refresh()}>
          Testar de novo
        </Button>
        <Button type="button" size="sm" loading={pending} disabled={!canRegister} onClick={() => startTransition(async () => setResult(await efiCadastrarWebhook()))}>
          Cadastrar webhook do Pix
        </Button>
        {sandbox && (
          <Button
            type="button"
            variant="dark"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setTestStatus(null);
                const res = await efiPixTeste();
                if (res.ok) setTest(res);
                else setResult({ ok: false, message: res.message });
              })
            }
          >
            Criar Pix de teste (R$ 1,00)
          </Button>
        )}
      </div>
      {result && (
        <p role="status" className={result.ok ? "text-[15px] font-semibold" : "text-[15px] font-semibold text-coral-700"}>
          {result.message}
        </p>
      )}
      {test && (
        <div className="grid gap-4 rounded-control border border-line p-4 md:grid-cols-[180px_1fr]">
          {test.pixImage ? <Image src={test.pixImage} alt="QR Code do Pix de teste" width={180} height={180} unoptimized /> : <div />}
          <div className="min-w-0 space-y-2 text-[14px]">
            <p>
              Cobrança criada na homologação (txid <code>{test.txid}</code>). Em homologação, valores até R$ 10,00 são confirmados
              sozinhos pela Efí e o webhook é chamado.
            </p>
            {test.pixCode && <p className="break-all rounded-control bg-mist p-2 font-mono text-[12px]">{test.pixCode}</p>}
            <Button type="button" variant="outline" size="sm" loading={pending} onClick={() => startTransition(async () => setTestStatus(await efiConsultarTeste(test.txid)))}>
              Consultar situação
            </Button>
            {testStatus && (
              <p role="status" className={testStatus.ok ? "font-semibold" : "font-semibold text-coral-700"}>
                {testStatus.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
