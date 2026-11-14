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
});
