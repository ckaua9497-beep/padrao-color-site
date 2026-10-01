import { STORE } from "@/lib/catalog";
import { IconWhatsApp } from "@/components/icons";

export default function WhatsAppFloat() {
  return (
    <a
      href={STORE.whatsapp}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com a Padrão Color no WhatsApp"
      className="fixed bottom-5 left-5 z-40 grid size-14 animate-pulse-ring place-items-center rounded-full bg-[#25d366] text-white shadow-float transition-transform duration-300 hover:scale-110"
    >
      <IconWhatsApp className="size-8" />
      <span className="absolute right-0.5 top-0.5 size-3 rounded-full border-2 border-white bg-coral" />
    </a>
  );
}
