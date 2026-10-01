import Image from "next/image";
import Link from "next/link";

/** Logo com link para a home. `onDark` põe uma placa branca atrás (rodapé); fora do topo, carrega sob demanda. */
export default function Logo({ onDark = false, eager = !onDark, className = "" }: { onDark?: boolean; eager?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Padrão Color — página inicial" className={`inline-flex shrink-0 items-center ${onDark ? "rounded-control bg-white px-3 py-2" : ""} ${className}`}>
      <Image src="/logo-padrao-color.png" alt="" width={272} height={111} loading={eager ? "eager" : "lazy"} className="h-11 w-auto md:h-12" />
    </Link>
  );
}
