"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="buy"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copie o link da loja:", url);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Link copiado!" : "Copiar link"}</span>
    </Button>
  );
}
