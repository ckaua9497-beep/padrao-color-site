import { cx } from "@/components/ui/cx";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/multiloja/core";

/* Selo do status do pedido (painel e admin). Cores com texto escuro sobre fundo claro: leitura AA. */

const TONE: Record<OrderStatus, string> = {
  aguardando_pagamento: "bg-sun-50",
  pago: "bg-lime-50",
  em_producao: "bg-cyan-50",
  enviado: "bg-blue-50",
  entregue: "bg-lime-50",
  cancelado: "bg-mist text-muted",
  expirado: "bg-mist text-muted",
};

export default function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold text-ink", TONE[status], className)}>{ORDER_STATUS_LABEL[status]}</span>;
}
