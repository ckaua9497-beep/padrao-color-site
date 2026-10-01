"use client";

export default function QtyStepper({ value, onChange, size = "md", label = "Quantidade" }: { value: number; onChange: (v: number) => void; size?: "sm" | "md"; label?: string }) {
  const h = size === "sm" ? "h-9" : "h-13";
  return (
    <div className={`inline-flex ${h} items-center rounded-control border border-line-strong bg-white`}>
      <button type="button" aria-label="Diminuir" onClick={() => onChange(Math.max(1, value - 1))} className="grid h-full w-9 place-items-center text-lg text-muted transition-colors hover:text-ink">
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value.replace(/\D/g, ""));
          if (next) onChange(Math.min(99, next));
        }}
        className="w-9 bg-transparent text-center text-sm font-semibold outline-none"
      />
      <button type="button" aria-label="Aumentar" onClick={() => onChange(Math.min(99, value + 1))} className="grid h-full w-9 place-items-center text-lg text-muted transition-colors hover:text-ink">
        +
      </button>
    </div>
  );
}
