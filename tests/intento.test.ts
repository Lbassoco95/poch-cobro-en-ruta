import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operacionDerivada, planearIntento } from "../supabase/functions/_shared/intento.ts";

const AHORA = Date.parse("2026-11-15T12:00:00Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();
const dentro = (s: number) => new Date(AHORA + s * 1000).toISOString();

describe("planearIntento", () => {
  it("con QR vivo espera los segundos exactos hasta la expiración más 30 s", () => {
    const plan = planearIntento({
      pedidoEstado: "por_cobrar",
      cobroEstado: "en_proceso",
      intentosVivos: [dentro(100)],
      intentosDesdeApertura: 1,
      ahora: AHORA,
    });
    assert.deepEqual(plan, { accion: "esperar", segundos: 130 });
  });

  it("QR vencido pero dentro de la tolerancia de 30 s: espera, no intenta reabrir (el bug)", () => {
    const plan = planearIntento({
      pedidoEstado: "por_cobrar",
      cobroEstado: "en_proceso",
      intentosVivos: [hace(10)],
      intentosDesdeApertura: 1,
      ahora: AHORA,
    });
    assert.deepEqual(plan, { accion: "esperar", segundos: 20 });
  });

  it("cobro vencido y documento pendiente: reabre", () => {
    const plan = planearIntento({
      pedidoEstado: "pendiente",
      cobroEstado: "vencido",
      intentosVivos: [],
      intentosDesdeApertura: 1,
      ahora: AHORA,
    });
    assert.deepEqual(plan, { accion: "reabrir" });
  });

  it("cobro vencido con 5 intentos desde la apertura: límite, no reabre", () => {
    const plan = planearIntento({
      pedidoEstado: "pendiente",
      cobroEstado: "vencido",
      intentosVivos: [],
      intentosDesdeApertura: 5,
      ahora: AHORA,
    });
    assert.deepEqual(plan, { accion: "limite" });
  });

  it("cobro vigente sin QR vivo: crea el intento sin reabrir", () => {
    const plan = planearIntento({
      pedidoEstado: "por_cobrar",
      cobroEstado: "emitido",
      intentosVivos: [],
      intentosDesdeApertura: 0,
      ahora: AHORA,
    });
    assert.deepEqual(plan, { accion: "crear" });
  });

  it("cobro cancelado o pagado no se reabre ni se espera: lo resuelve la base", () => {
    for (const cobroEstado of ["cancelado", "pagado"]) {
      const plan = planearIntento({
        pedidoEstado: "devuelto",
        cobroEstado,
        intentosVivos: [dentro(60)],
        intentosDesdeApertura: 1,
        ahora: AHORA,
      });
      assert.deepEqual(plan, { accion: "crear" }, cobroEstado);
    }
  });
});

describe("operacionDerivada", () => {
  it("es estable, con forma de uuid y distinta por orden o etiqueta", async () => {
    const op = crypto.randomUUID();
    const a = await operacionDerivada(op, "abrir");
    assert.equal(a, await operacionDerivada(op, "abrir"));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(a, await operacionDerivada(crypto.randomUUID(), "abrir"));
    assert.notEqual(a, await operacionDerivada(op, "otra"));
  });
});
