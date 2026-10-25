import { test } from "node:test";
import assert from "node:assert/strict";
import type { V2 } from "./contorno.ts";
import {
  LED_DESENHO_PADRAO,
  LED_MAX_LINHAS,
  adicionarTraco,
  comprimentoCm,
  corDoContorno,
  desfazer,
  finalizarLinha,
  linhasDeLed,
  molduraDoQuadro,
  ordenarLacos,
  corrigirLinha,
  removerLinha,
  resumoLed,
  usarOriginal,
  simplificar,
  trocarCor,
  trocarCorDoContorno,
  type LedDesenho,
} from "./led-linhas.ts";

const QUADRO = { widthCm: 50, heightCm: 50 };
const ROSA = "#ff4fd8";
const AZUL = "#2f6bff";
let seq = 0;
const id = () => `l${(seq += 1)}`;
/** Reta de (x0, y) a (x1, y), em fração, com `n` pontos. */
const reta = (x0: number, x1: number, y: number, n = 20): V2[] => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y]);

test("o primeiro traço começa uma linha na cor escolhida e fica em andamento", () => {
  const d = adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.6, 0.5), ROSA, QUADRO, 1.2, id);
  assert.equal(d.linhas.length, 1);
  assert.equal(d.linhas[0].cor, ROSA);
  assert.equal(d.emAndamento, d.linhas[0].id);
  assert.ok(Math.abs(comprimentoCm(d.linhas[0].pontos, false, QUADRO) - 20) < 0.5);
});

test("o traço seguinte continua a mesma linha (o LED é contínuo), na cor dela", () => {
  let d = adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.4, 0.3), ROSA, QUADRO, 1.2, id);
  d = adicionarTraco(d, reta(0.4, 0.8, 0.6), AZUL, QUADRO, 1.2, id);
  assert.equal(d.linhas.length, 1);
  assert.equal(d.linhas[0].cor, ROSA);
  assert.deepEqual(d.linhas[0].tracos?.length, 2);
  // Outra cor: finaliza e começa a próxima linha.
  d = finalizarLinha(d, QUADRO);
  d = adicionarTraco(d, reta(0.2, 0.8, 0.8), AZUL, QUADRO, 1.2, id);
  assert.equal(d.linhas.length, 2);
  assert.deepEqual(
    d.linhas.map((l) => l.cor),
    [ROSA, AZUL],
  );
});

test("o LED fica a pelo menos a distância da borda", () => {
  const d = adicionarTraco(LED_DESENHO_PADRAO, [[0, 0], [1, 1]], ROSA, QUADRO, 1.2, id);
  const [a, b] = d.linhas[0].pontos;
  assert.ok(Math.abs(a[0] - 1.2 / 50) < 1e-9 && Math.abs(a[1] - 1.2 / 50) < 1e-9);
  assert.ok(Math.abs(b[0] - (1 - 1.2 / 50)) < 1e-9);
});

test("linha curta demais some ao finalizar; terminar perto do começo fecha a linha", () => {
  let d = adicionarTraco(LED_DESENHO_PADRAO, reta(0.5, 0.52, 0.5, 3), ROSA, QUADRO, 1.2, id);
  d = finalizarLinha(d, QUADRO);
  assert.equal(d.linhas.length, 0);
  assert.equal(d.emAndamento, null);

  const quadrado: V2[] = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
    [0.305, 0.31],
  ];
  d = finalizarLinha(adicionarTraco(LED_DESENHO_PADRAO, quadrado, AZUL, QUADRO, 1.2, id), QUADRO);
  assert.equal(d.linhas.length, 1);
  assert.equal(d.linhas[0].fechada, true);
  assert.equal(d.linhas[0].tracos, undefined);
  // A correção reconhece o quadrado: lados retos e cantos no raio da fita (2 cm); o desenhado fica guardado.
  assert.equal(d.linhas[0].forma, "retangulo");
  assert.ok((d.linhas[0].original?.length ?? 0) >= 4);
  assert.ok(Math.abs(comprimentoCm(d.linhas[0].pontos, true, QUADRO) - (80 - (8 - 2 * Math.PI) * 2)) < 1, `${comprimentoCm(d.linhas[0].pontos, true, QUADRO)}`);
  // O desenhado passou só pelo estabilizador do traço (média móvel): cantos levemente amaciados.
  assert.ok(Math.abs(comprimentoCm(d.linhas[0].original ?? [], true, QUADRO) - 80) < 1.5);
});

test("o traço corrigido volta ao desenhado e é corrigido de novo; com a correção desligada, fica como foi", () => {
  const quadrado: V2[] = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
    [0.305, 0.31],
  ];
  const d = finalizarLinha(adicionarTraco(LED_DESENHO_PADRAO, quadrado, AZUL, QUADRO, 1.2, id), QUADRO);
  const linha = d.linhas[0].id;
  const voltou = usarOriginal(d, linha);
  assert.deepEqual(voltou.linhas[0].pontos, d.linhas[0].original);
  assert.equal(voltou.linhas[0].forma, null);
  assert.equal(voltou.linhas[0].cor, AZUL);
  const de_novo = corrigirLinha(voltou, linha, QUADRO);
  assert.equal(de_novo.linhas[0].forma, "retangulo");
  const sem = finalizarLinha(adicionarTraco({ ...LED_DESENHO_PADRAO, corrigir: false }, quadrado, AZUL, QUADRO, 1.2, id), QUADRO);
  assert.equal(sem.linhas[0].forma, undefined);
  assert.equal(sem.linhas[0].original, undefined);
  assert.ok(Math.abs(comprimentoCm(sem.linhas[0].pontos, true, QUADRO) - 80) < 1.5);
});

test("desfazer tira o último traço da linha em andamento, depois a linha", () => {
  let d = adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.4, 0.3), ROSA, QUADRO, 1.2, id);
  d = adicionarTraco(d, reta(0.4, 0.8, 0.6), ROSA, QUADRO, 1.2, id);
  const antes = d.linhas[0].pontos.length;
  d = desfazer(d);
  assert.ok(d.linhas[0].pontos.length < antes);
  assert.equal(d.linhas[0].tracos?.length, 1);
  d = desfazer(d);
  assert.equal(d.linhas.length, 0);
  assert.equal(d.emAndamento, null);
});

test("trocar a cor, remover e o limite de linhas", () => {
  let d = finalizarLinha(adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.8, 0.5), ROSA, QUADRO, 1.2, id), QUADRO);
  const linha = d.linhas[0].id;
  d = trocarCor(d, linha, AZUL);
  assert.equal(d.linhas[0].cor, AZUL);
  assert.equal(removerLinha(d, linha).linhas.length, 0);
  let cheio: LedDesenho = LED_DESENHO_PADRAO;
  for (let i = 0; i < LED_MAX_LINHAS + 3; i += 1) cheio = finalizarLinha(adicionarTraco(cheio, reta(0.1, 0.9, 0.1 + i * 0.02), ROSA, QUADRO, 1.2, id), QUADRO);
  assert.equal(cheio.linhas.length, LED_MAX_LINHAS);
});

test("cada laço do contorno tem a sua cor; trocar um não pinta os outros", () => {
  let d: LedDesenho = LED_DESENHO_PADRAO;
  assert.equal(corDoContorno(d, 2, ROSA), ROSA);
  d = trocarCorDoContorno(d, 0, AZUL, ROSA);
  assert.equal(corDoContorno(d, 0, ROSA), AZUL);
  assert.equal(corDoContorno(d, 1, ROSA), ROSA);
  d = trocarCorDoContorno(d, 2, "#39ff7a", ROSA);
  assert.deepEqual(d.coresAuto, [AZUL, ROSA, "#39ff7a"]);
});

test("laços do maior para o menor", () => {
  const pequeno: V2[] = [
    [0, 0],
    [0.1, 0],
    [0.1, 0.1],
  ];
  const grande: V2[] = [
    [0, 0],
    [0.5, 0],
    [0.5, 0.5],
  ];
  assert.deepEqual(ordenarLacos([pequeno, grande]), [grande, pequeno]);
});

test("linhas de LED: contorno ligado, moldura sem desenho e as do pincel numeradas em seguida", () => {
  const laco: V2[] = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
  ];
  let d = finalizarLinha(adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.8, 0.9), AZUL, QUADRO, 1.2, id), QUADRO);
  const comDesenho = linhasDeLed(d, [laco], false, QUADRO, ROSA);
  assert.deepEqual(
    comDesenho.map((l) => [l.n, l.origem, l.cor]),
    [
      [1, "contorno", ROSA],
      [2, "pincel", AZUL],
    ],
  );
  const foto = linhasDeLed(d, [laco], true, QUADRO, ROSA);
  assert.equal(foto[0].origem, "moldura");
  d = { ...d, auto: false };
  assert.deepEqual(
    linhasDeLed(d, [laco], false, QUADRO, ROSA).map((l) => l.origem),
    ["pincel"],
  );
});

test("moldura: retângulo arredondado a meia margem da borda", () => {
  const m = molduraDoQuadro({ widthCm: 60, heightCm: 70 });
  const xs = m.map((p) => p[0] * 60);
  const ys = m.map((p) => p[1] * 70);
  // Margem de 9% de 60 = 5,4 cm; o tubo fica a 2,7 cm da borda.
  assert.ok(Math.abs(Math.min(...xs) - 2.7) < 0.05, `${Math.min(...xs)}`);
  assert.ok(Math.abs(Math.max(...ys) - 67.3) < 0.05);
  assert.ok(m.length >= 24 && m.length <= 240);
});

test("simplificar tira os pontos alinhados e mantém as curvas", () => {
  assert.equal(simplificar(reta(0.1, 0.9, 0.5, 50), 0.05, QUADRO).length, 2);
  const curva: V2[] = Array.from({ length: 60 }, (_, i) => [0.5 + 0.3 * Math.cos(i / 10), 0.5 + 0.3 * Math.sin(i / 10)]);
  assert.ok(simplificar(curva, 0.05, QUADRO).length > 10);
});

test("resumo do pedido com cor, origem e medida de cada linha", () => {
  const d = finalizarLinha(adicionarTraco(LED_DESENHO_PADRAO, reta(0.2, 0.8, 0.9), AZUL, QUADRO, 1.2, id), QUADRO);
  const laco: V2[] = [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
  ];
  const nomes: Record<string, string> = { [ROSA]: "Rosa", [AZUL]: "Azul" };
  assert.equal(resumoLed(linhasDeLed(d, [laco], false, QUADRO, ROSA), (c) => nomes[c] ?? c), "2 linhas, 1,10 m · 1 rosa (contorno, 80 cm) · 2 azul (pincel, 30 cm)");
});
