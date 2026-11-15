import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarGrupos } from "../supabase/functions/_shared/rutas.ts";

const centro = { id: "r1", nombre: "Ruta Demo Centro", fecha: "2026-11-14", estado: "abierta" };
const jueces = { id: "r2", nombre: "Ruta Demo Jueces", fecha: "2026-11-15", estado: "abierta" };
const p = (id: string, ruta_id: string, estado: string, total: number) => ({ id, ruta_id, estado, total });

describe("armarGrupos", () => {
  it("devuelve todas las rutas abiertas, cada una con sus paradas y su resumen", () => {
    const grupos = armarGrupos(
      [jueces, centro],
      [
        p("a", "r1", "entregado", 0.11),
        p("b", "r1", "pendiente", 0.08),
        p("c", "r2", "pagado", 0.08),
        p("d", "r2", "por_cobrar", 0.06),
        p("e", "r2", "pendiente", 0.09),
      ],
    );
    assert.deepEqual(grupos.map((g) => g.ruta.nombre), ["Ruta Demo Jueces", "Ruta Demo Centro"]);
    assert.deepEqual(grupos[0].paradas.map((x) => x.id), ["c", "d", "e"]);
    assert.deepEqual(grupos[0].resumen, { entregadas: 0, cobrado: 0.08, por_cobrar: 0.15 });
    assert.equal(grupos[0].siguiente_parada, "c");
    assert.deepEqual(grupos[1].resumen, { entregadas: 1, cobrado: 0.11, por_cobrar: 0.08 });
    assert.equal(grupos[1].siguiente_parada, "b");
  });

  it("una ruta sin paradas pendientes no tiene siguiente parada", () => {
    const [grupo] = armarGrupos([centro], [p("a", "r1", "entregado", 0.11), p("b", "r1", "devuelto", 0.08)]);
    assert.equal(grupo.siguiente_parada, null);
  });

  it("sin rutas devuelve una lista vacía", () => {
    assert.deepEqual(armarGrupos([], []), []);
  });
});
