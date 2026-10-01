import Image from "next/image";
import Link from "next/link";

export default function Logo({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Padrão Color — página inicial"
      className={`inline-flex shrink-0 items-center ${onDark ? "rounded-[14px] bg-white px-3 py-2" : ""} ${className}`}
    >
      <Image src="/logo-padrao-color.png" alt="Padrão Color — Gráfica e Comunicação Visual" width={272} height={111} priority className="h-11 w-auto md:h-12" />
    </Link>
  );
}
