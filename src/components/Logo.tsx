import Image from "next/image";
import Link from "next/link";

/**
 * Logo com link para a home (arte do Figma, 1828 × 578 com fundo transparente; no topo do computador fica com
 * 154 × 49 como no Figma). `onDark` põe uma placa branca atrás (rodapé); fora do topo, carrega sob demanda.
 */
export default function Logo({ onDark = false, eager = !onDark, className = "" }: { onDark?: boolean; eager?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Padrão Color — página inicial" className={`inline-flex shrink-0 items-center ${onDark ? "rounded-control bg-white px-3 py-2" : ""} ${className}`}>
      <Image src="/site/marca/logo-padrao-color.webp" alt="" width={155} height={49} loading={eager ? "eager" : "lazy"} className="h-8 w-auto min-[360px]:h-9 md:h-10 lg:h-[49px]" />
    </Link>
  );
}
