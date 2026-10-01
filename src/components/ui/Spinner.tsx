import { cx } from "./cx";

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className ?? "size-4")} />;
}
