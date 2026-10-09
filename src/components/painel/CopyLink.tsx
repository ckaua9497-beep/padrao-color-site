"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function CopyLink({ url, label = "Copiar link" }: { url: string; label?: string }) {
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
          window.prompt("Copie o link:", url);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Link copiado!" : label}</span>
    </Button>
  );
}
