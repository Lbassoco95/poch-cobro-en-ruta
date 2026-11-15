import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOVER_PARADA_CON_COBRO_EN_CURSO, paradaSePuedeMover, puedeIntercambiar } from "../src/lib/parada.ts";
import { cambiosReorden, movimientosPorParada } from "../src/lib/reorden.ts";

describe("orden de paradas", () => {
  it("deja la regla del cobro en curso en un solo lugar", () => {
    const conQr = { estado: "por_cobrar", cobro: { vigente: true, estado: "en_proceso" } };
    assert.equal(paradaSePuedeMover(conQr), MOVER_PARADA_CON_COBRO_EN_CURSO);
    assert.equal(paradaSePuedeMover({ estado: "pagado" }), false);
    assert.equal(paradaSePuedeMover({ estado: "entregado" }), false);
    assert.equal(paradaSePuedeMover({ estado: "pendiente" }), true);
  });

  it("no intercambia con una parada que la regla deja fija", () => {
    const lista = [
      { estado: "por_cobrar", cobro: { vigente: true } },
      { estado: "pendiente", cobro: null },
    ];
    if (MOVER_PARADA_CON_COBRO_EN_CURSO) {
      assert.equal(puedeIntercambiar(lista, 0, 1), true);
    } else {
      assert.equal(puedeIntercambiar(lista, 1, 0), false);
    }
  });

  it("lee el cambio de orden desde los folios de la bitácora", () => {
    const nombres = new Map([["REM-1045", "Moto Centro"], ["REM-1040", "Taller Norte"]]);
    const cambios = cambiosReorden(
      { antes: ["REM-1040", "REM-1045"], despues: ["REM-1045", "REM-1040"] },
      nombres,
    );
    assert.deepEqual(cambios, [
      { id: "REM-1045", alias: "Moto Centro", de: 2, a: 1 },
      { id: "REM-1040", alias: "Taller Norte", de: 1, a: 2 },
    ]);
  });

  it("conserva la parada de origen si hubo más de un cambio", () => {
    const mapa = movimientosPorParada([
      { id: 1, detalle: { antes: ["a", "b", "c"], despues: ["b", "a", "c"] } },
      { id: 2, detalle: { antes: ["b", "a", "c"], despues: ["b", "c", "a"] } },
    ]);
    assert.deepEqual(mapa.get("a"), { de: 1, a: 3 });
    assert.equal(mapa.has("b"), true);
  });
});
