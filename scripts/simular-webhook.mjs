#!/usr/bin/env node
/**
 * Simula un aviso de pey firmado (Standard Webhooks) hacia webhook-pey.
 * Es solo de desarrollo. Si se usa en una demo en vivo, dígalo abiertamente: es simulación.
 * No imprime el secreto.
 */
import { Webhook } from "standardwebhooks";

const url = process.argv[2] ?? process.env.WEBHOOK_URL ?? "http://127.0.0.1:54321/functions/v1/webhook-pey";
const secreto = process.env.PEY_WEBHOOK_SECRET
  ?? ("whsec_" + Buffer.from("poch-prueba-local").toString("base64"));
const usandoLocal = !process.env.PEY_WEBHOOK_SECRET;

const cuerpo = JSON.stringify({
  amount: Number(process.env.MONTO ?? "0.01"),
  apiKeyId: "sim_api",
  bankAccountId: "sim_ba",
  codiQrId: process.env.CODI_QR_ID ?? "qr_simulacion",
  concept: process.env.CONCEPTO ?? "Simulación Poch",
  datePaid: Math.floor(Date.now() / 1000),
  numRef: process.env.NUM_REF ?? "1",
  transactionId: process.env.TX_ID ?? `sim_${Date.now()}`,
  type: "codi.qr.payment_received",
  metadata: {
    // CLABE ficticia de ceros; no es una cuenta real.
    clabe: "000000000000000000",
    bankCode: process.env.BANK_CODE ?? "012",
    accountType: "40",
    trackingKey: process.env.RASTREO ?? "sim_rastreo",
    externalMetadata: {
      intento_id: process.env.INTENTO_ID ?? "",
      cobro_id: process.env.COBRO_ID ?? "",
    },
  },
});

const id = `msg_sim_${Date.now()}`;
const fecha = new Date();
const firma = new Webhook(secreto).sign(id, fecha, cuerpo);

const respuesta = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(fecha.getTime() / 1000)),
    "webhook-signature": firma,
  },
  body: cuerpo,
});

const texto = await respuesta.text();
console.log("Simulación de webhook pey (no es un pago real).");
if (usandoLocal) console.log("Se usó el secreto local de prueba porque PEY_WEBHOOK_SECRET no está definido.");
console.log(`POST ${url} → ${respuesta.status}`);
console.log(texto);
process.exit(respuesta.ok ? 0 : 1);
