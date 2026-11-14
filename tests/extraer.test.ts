import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extraerDatosPago, payloadSinClabe } from "../supabase/functions/_shared/extraer.ts";

describe("extraerDatosPago", () => {
  it("lee el payload documentado de QR con intento_id", () => {
    const intento = "11111111-1111-4111-8111-111111111111";
    const datos = extraerDatosPago({
      amount: 0.01,
      type: "codi.qr.payment_received",
      datePaid: 1_731_600_000,
      transactionId: "01HXYZTRANSACTIONID000001",
      numRef: "42",
      codiQrId: "qr_abc",
      metadata: {
        // CLABE ficticia de ceros para la forma del aviso; no es una cuenta real.
        clabe: "000000000000000000",
        bankCode: "012",
        accountType: "40",
        trackingKey: "clave",
        externalMetadata: { intento_id: intento, cobro_id: "22222222-2222-4222-8222-222222222222" },
      },
    });
    assert.equal(datos.completo, true);
    assert.equal(datos.via, "intento_id");
    assert.equal(datos.intentoId, intento);
    assert.equal(datos.codiQrId, "qr_abc");
    assert.equal(datos.clabe4, "0000");
    assert.equal(datos.tipoCuenta, "40");
    assert.equal(datos.banco, "012");
  });

  it("lee el payload de aviso (PN) y cae a numRef", () => {
    const datos = extraerDatosPago({
      amount: 0.02,
      type: "codi.pn.payment_received",
      datePaid: 1_731_600_100,
      transactionId: "01HXYZTRANSACTIONID000002",
      numRef: "7",
      metadata: {
        clabe: "000000000000000099",
        bankCode: "014",
        accountType: "40",
        trackingKey: "otra",
        externalMetadata: {},
      },
    });
    assert.equal(datos.completo, true);
    assert.equal(datos.via, "num_ref");
    assert.equal(datos.numRef, "7");
    assert.equal(datos.clabe4, "0099");
  });

  it("marca sin_cobro si no hay intento ni numRef ni QR", () => {
    const datos = extraerDatosPago({
      amount: 0.01,
      type: "codi.qr.payment_received",
      datePaid: 1_731_600_000,
      transactionId: "01HXYZTRANSACTIONID000003",
      metadata: { bankCode: "012" },
    });
    assert.equal(datos.completo, false);
    assert.equal(datos.motivo, "sin_cobro");
  });

  it("reduce la CLABE en el payload guardado", () => {
    const limpio = payloadSinClabe({
      metadata: { clabe: "000000000000000123" },
    }) as { metadata: { clabe: string } };
    assert.equal(limpio.metadata.clabe, "0123");
  });
});
