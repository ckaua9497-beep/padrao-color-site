import { STORE } from "@/lib/store";
import { IconWhatsApp } from "@/components/icons";

export default function WhatsAppFloat() {
  return (
    <a
      href={STORE.whatsapp}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com a Padrão Color no WhatsApp"
      className="fixed bottom-5 left-5 z-float grid size-14 animate-pulse-ring place-items-center rounded-full bg-whatsapp text-white shadow-float transition-transform duration-300 hover:scale-110"
    >
      <IconWhatsApp aria-hidden className="size-8" />
      <span aria-hidden className="absolute right-0.5 top-0.5 size-3 rounded-full border-2 border-white bg-coral" />
    </a>
  );
}
