import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verificarFirma } from "../supabase/functions/_shared/firma.ts";
import { SECRETO_LOCAL, firmarAviso } from "./helpers.ts";

describe("verificarFirma", () => {
  it("acepta una firma válida de standardwebhooks", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.webhookId, encabezados.get("webhook-id"));
  });

  it("rechaza una firma inválida", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    encabezados.set("webhook-signature", "v1,firma_incorrecta");
    const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, "firma");
  });

  it("rechaza el cuerpo alterado", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    const resultado = await verificarFirma('{"ok":false}', encabezados, SECRETO_LOCAL);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, "firma");
  });

  it("rechaza avisos con fecha fuera de 5 minutos, hacia atrás y hacia adelante", async () => {
    const cuerpo = '{"ok":true}';
    const ahora = Math.floor(Date.now() / 1000);
    for (const desfase of [-301, -3600, 301, 3600]) {
      const encabezados = firmarAviso(cuerpo, "msg_t", new Date((ahora + desfase) * 1000));
      const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL, ahora);
      assert.equal(resultado.ok, false, `desfase ${desfase}`);
      assert.equal(resultado.motivo, "tiempo");
    }
  });

  it("acepta avisos justo dentro de la tolerancia de 5 minutos", async () => {
    const cuerpo = '{"ok":true}';
    const ahora = Math.floor(Date.now() / 1000);
    for (const desfase of [-300, 300]) {
      const encabezados = firmarAviso(cuerpo, "msg_t", new Date((ahora + desfase) * 1000));
      const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL, ahora);
      assert.equal(resultado.ok, true, `desfase ${desfase}`);
    }
  });

  it("rechaza marcas de tiempo que no son números", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    encabezados.set("webhook-timestamp", "mañana");
    const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, "tiempo");
  });

  it("rechaza firmas de otra longitud o con prefijo distinto de v1", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    const buena = encabezados.get("webhook-signature")!.split(",")[1];
    for (const firma of [`v1,${buena}A`, `v1,${buena.slice(0, -2)}`, `v2,${buena}`, buena]) {
      encabezados.set("webhook-signature", firma);
      const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL);
      assert.equal(resultado.ok, false, firma);
    }
  });

  it("acepta si una de varias firmas separadas por espacio es la válida", async () => {
    const cuerpo = '{"ok":true}';
    const encabezados = firmarAviso(cuerpo);
    encabezados.set("webhook-signature", `v1,otra_firma ${encabezados.get("webhook-signature")}`);
    const resultado = await verificarFirma(cuerpo, encabezados, SECRETO_LOCAL);
    assert.equal(resultado.ok, true);
  });
});
