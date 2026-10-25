"use client";

import { useId } from "react";
import { IconBrush, IconClose } from "@/components/icons";
import { LED_COLORS, ledColorName } from "@/components/mockup/art";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { LED_MARGEM_CM } from "@/lib/contorno";
import { FORMA_LABEL } from "@/lib/led-forma";
import { LED_MAX_LINHAS, corrigirLinha, desfazer, finalizarLinha, medidaLed, removerLinha, trocarCor, trocarCorDoContorno, usarOriginal, type LedDesenho, type LinhaDeLed, type Medida } from "@/lib/led-linhas";
import type { LedContour } from "./use-led-contour";

type Props = {
  desenho: LedDesenho;
  onDesenho: (update: (d: LedDesenho) => LedDesenho) => void;
  /** Linhas como saem (linhasDeLed): contorno ou moldura e as do pincel, numeradas. */
  linhas: readonly LinhaDeLed[];
  contorno: LedContour | null;
  medida: Medida;
  corPadrao: string;
  pincel: boolean;
  onPincel: (on: boolean) => void;
  /** Cor da próxima linha do pincel. */
  cor: string;
  onCor: (cor: string) => void;
  /** Linha escolhida na lista (a paleta troca a cor dela). */
  destaque: string | null;
  onDestaque: (id: string | null) => void;
};

const ORIGEM: Record<LinhaDeLed["origem"], string> = { contorno: "Contorno", moldura: "Moldura", pincel: "Pincel" };

/**
 * Linhas de LED do quadro acrílico com neon (src/lib/led-linhas.ts), só na frente. O LED é uma fita contínua de uma
 * cor: cada linha tem a sua. O contorno automático sai do desenho (um laço por parte, cada um com a sua cor); o pincel
 * desenha linhas por cima da imagem enviada ou da arte criada, e só começa outra cor depois de "Finalizar linha". Ao
 * finalizar, o traço feito à mão é corrigido (led-forma.ts: reta, retângulo, círculo, polígono ou traço suavizado); o
 * cliente pode voltar ao traço como desenhou, corrigir de novo ou desligar a correção.
 */
export function LedLinesPanel({ desenho, onDesenho, linhas, contorno, medida, corPadrao, pincel, onPincel, cor, onCor, destaque, onDestaque }: Props) {
  const hintId = useId();
  const total = linhas.reduce((s, l) => s + l.comprimentoCm, 0);
  const doPincel = desenho.linhas.length;
  const andamento = desenho.emAndamento ? linhas.find((l) => l.id === desenho.emAndamento) : undefined;
  const escolhida = destaque ? linhas.find((l) => l.id === destaque) : undefined;
  // A paleta troca a cor da linha escolhida; sem escolha, a da linha em andamento (a linha inteira é de uma cor) ou a
  // da próxima linha.
  const alvo = escolhida ?? andamento ?? null;
  const corAtual = alvo?.cor ?? cor;
  const desenhado = contorno && !contorno.cheio && contorno.lacos.length > 0;
  const corrigir = desenho.corrigir !== false;
  const doPincelPorId = new Map(desenho.linhas.map((l) => [l.id, l]));
  // Situação da linha do pincel na lista: em andamento, a forma da correção ou fechada.
  const detalhe = (linha: LinhaDeLed) => {
    if (linha.origem !== "pincel") return "";
    if (linha.id === desenho.emAndamento) return " · em andamento";
    const forma = doPincelPorId.get(linha.id)?.forma;
    if (forma) return ` · ${FORMA_LABEL[forma]} (corrigido)`;
    return linha.fechada ? " · fechada" : "";
  };
  const escolhidaPincel = escolhida?.origem === "pincel" && escolhida.id !== desenho.emAndamento ? doPincelPorId.get(escolhida.id) : undefined;

  const pintar = (nova: string) => {
    if (alvo) {
      if (alvo.origem === "pincel") onDesenho((d) => trocarCor(d, alvo.id, nova));
      else onDesenho((d) => trocarCorDoContorno(d, Number(alvo.id.split(":")[1]) || 0, nova, corPadrao));
    }
    // A próxima linha sai na última cor escolhida.
    if (!escolhida || escolhida.origem === "pincel") onCor(nova);
  };

  return (
    <section aria-label="Linhas de LED" className="grid gap-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-bold">
        Linhas de LED
        <span className="text-caption font-normal text-muted">
          só na frente · {linhas.length} {linhas.length === 1 ? "linha" : "linhas"}
          {linhas.length ? `, ${medidaLed(total)} de LED` : ""}
        </span>
      </p>
      <p id={hintId} className="text-caption text-muted">
        O LED é uma fita contínua que acende numa cor só: cada linha tem a sua cor. Para usar outra cor, finalize a linha e comece a próxima.
      </p>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={desenho.auto}
          // Sem nenhuma linha do pincel, o contorno é o único LED: não dá para desligar.
          disabled={desenho.auto && doPincel === 0}
          onChange={(event) => onDesenho((d) => ({ ...d, auto: event.target.checked }))}
          className="mt-0.5 size-4 accent-coral-700"
        />
        <span>
          <strong>Contorno automático</strong>{" "}
          <span className="text-muted">
            {desenhado
              ? `· ${contorno.lacos.length === 1 ? "o LED contorna o desenho" : `${contorno.lacos.length} contornos, um por parte do desenho`} a ${String(LED_MARGEM_CM).replace(".", ",")} cm dele`
              : "· arte sem fundo transparente (ou sem desenho): o LED contorna a moldura do quadro"}
            {desenho.auto && doPincel === 0 ? ". Para desligar, desenhe uma linha com o pincel." : ""}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={corrigir} onChange={(event) => onDesenho((d) => ({ ...d, corrigir: event.target.checked }))} className="mt-0.5 size-4 accent-coral-700" />
        <span>
          <strong>Corrigir o traço sozinho</strong>{" "}
          <span className="text-muted">· ao finalizar, o traço tremido vira reta, retângulo, círculo ou curva suave, com os cantos que a fita de LED consegue fazer</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={pincel ? "dark" : "outline"} size="sm" aria-pressed={pincel} icon={<IconBrush className="size-4" />} onClick={() => onPincel(!pincel)} disabled={!pincel && doPincel >= LED_MAX_LINHAS && !andamento}>
          {pincel ? "Pincel ligado" : "Desenhar com o pincel"}
        </Button>
        <Button variant="outline" size="sm" disabled={!andamento} onClick={() => onDesenho((d) => finalizarLinha(d, medida))}>
          Finalizar linha
        </Button>
        <Button variant="outline" size="sm" disabled={!doPincel} onClick={() => onDesenho(desfazer)}>
          Desfazer
        </Button>
      </div>
      {pincel && (
        <p role="status" className="rounded-control bg-mist px-3 py-2 text-caption text-ink">
          {andamento
            ? `Linha ${andamento.n} em andamento (${ledColorName(andamento.cor).toLowerCase()}): o próximo traço continua dela. Para outra cor, finalize a linha.`
            : "Arraste na área acima para desenhar uma linha de LED. Soltar o traço não termina a linha: finalize quando ela estiver pronta."}
        </p>
      )}
      {doPincel >= LED_MAX_LINHAS && !andamento && <p className="text-caption text-muted">Limite de {LED_MAX_LINHAS} linhas do pincel por quadro.</p>}

      <div>
        <p className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
          {escolhida ? `Cor da linha ${escolhida.n}` : andamento ? `Cor da linha ${andamento.n} (em andamento)` : "Cor da próxima linha"}
          <span className="text-caption font-normal text-muted">{ledColorName(corAtual)}</span>
        </p>
        <div role="group" aria-label="Cor do LED" aria-describedby={hintId} className="flex flex-wrap gap-2">
          {LED_COLORS.map((led) => {
            const on = led.value === corAtual.toLowerCase();
            return (
              <button
                key={led.value}
                type="button"
                aria-pressed={on}
                aria-label={led.label}
                title={led.label}
                onClick={() => pintar(led.value)}
                className={cx("grid size-swatch place-items-center rounded-control bg-night p-1 transition-shadow duration-200", on ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-ink/40")}
              >
                <span className="size-6 rounded-full ring-2 ring-white/70" style={{ background: led.value, boxShadow: `0 0 12px 2px ${led.value}` }} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      {escolhidaPincel && (escolhidaPincel.forma || escolhidaPincel.original) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
          {escolhidaPincel.forma ? `Linha ${escolhida?.n} corrigida como ${FORMA_LABEL[escolhidaPincel.forma]}.` : `Linha ${escolhida?.n} como você desenhou.`}
          {escolhidaPincel.forma ? (
            <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => onDesenho((d) => usarOriginal(d, escolhidaPincel.id))}>
              Usar o traço como desenhei
            </Button>
          ) : (
            <Button variant="link" size="sm" className="min-h-6 text-caption" onClick={() => onDesenho((d) => corrigirLinha(d, escolhidaPincel.id, medida))}>
              Corrigir este traço
            </Button>
          )}
        </p>
      )}

      {linhas.length > 0 && (
        <ul className="grid gap-1.5" aria-label="Linhas de LED do quadro">
          {linhas.map((linha) => {
            const on = destaque === linha.id;
            return (
              <li key={linha.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDestaque(on ? null : linha.id)}
                  className={cx("flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-control px-3 text-left text-sm ring-1 transition-shadow", on ? "bg-mist ring-ink" : "ring-line hover:ring-ink/40")}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{linha.n}</span>
                  <span className="size-3.5 shrink-0 rounded-full" style={{ background: linha.cor, boxShadow: `0 0 8px 1px ${linha.cor}` }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <strong>{ORIGEM[linha.origem]}</strong> · {ledColorName(linha.cor).toLowerCase()} · {medidaLed(linha.comprimentoCm)}
                    {detalhe(linha)}
                  </span>
                </button>
                {linha.origem === "pincel" && (
                  <button
                    type="button"
                    aria-label={`Apagar a linha ${linha.n}`}
                    title="Apagar a linha"
                    onClick={() => {
                      if (on) onDestaque(null);
                      onDesenho((d) => removerLinha(d, linha.id));
                    }}
                    className="grid size-10 shrink-0 place-items-center rounded-control text-muted ring-1 ring-line hover:text-ink hover:ring-ink/40"
                  >
                    <IconClose className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
