import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { Webhook } from "standardwebhooks";

export const SECRETO_LOCAL = "whsec_" + Buffer.from("poch-prueba-local").toString("base64");

export function abortarSiNube(url: string | undefined): void {
  const valor = url ?? process.env.DATABASE_URL ?? "";
  if (/supabase\.co/i.test(valor)) {
    throw new Error("Las pruebas no pueden apuntar a un proyecto de Supabase en la nube.");
  }
}

export async function clientePrueba(): Promise<Client> {
  abortarSiNube(process.env.DATABASE_URL);
  const cliente = new Client({
    host: process.env.PGHOST ?? "/var/run/postgresql",
    database: process.env.PGDATABASE ?? "poch_pruebas",
    user: process.env.PGUSER ?? process.env.USER,
  });
  await cliente.connect();
  const version = await cliente.query("show server_version_num");
  const num = Number(Object.values(version.rows[0] ?? {})[0] ?? 0);
  if (num < 160000 || num >= 170000) {
    await cliente.end();
    throw new Error(`Se requiere Postgres 16; esta instancia reporta ${num}`);
  }
  return cliente;
}

export async function reiniciarBase(cliente: Client): Promise<void> {
  await cliente.query("drop schema if exists public cascade");
  await cliente.query("drop schema if exists auth cascade");
  await cliente.query("create schema public");
  await cliente.query("create schema auth");
  await cliente.query("create schema if not exists extensions");
  await cliente.query("create extension if not exists pgcrypto with schema extensions");
  await cliente.query(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  `);
  await cliente.query("create table auth.users (id uuid primary key, email text unique)");
  const raiz = resolve(import.meta.dirname ?? ".", "..");
  for (const archivo of [
    "supabase/migrations/20261114120000_esquema.sql",
    "supabase/migrations/20261114120100_logica.sql",
    "supabase/migrations/20261114140000_pago_real.sql",
    "supabase/migrations/20261114200000_ruta_entrega.sql",
    "supabase/migrations/20261114210000_reorden_paradas_orden_compra.sql",
  ]) {
    await cliente.query(readFileSync(resolve(raiz, archivo), "utf8"));
  }
}

export async function sembrarDemo(cliente: Client): Promise<{
  admin: string;
  repartidor1: string;
  repartidor2: string;
  producto: { id: string; precio: number };
}> {
  const admin = crypto.randomUUID();
  const r1 = crypto.randomUUID();
  const r2 = crypto.randomUUID();
  await cliente.query(
    `insert into auth.users (id, email) values
      ($1,'admin@demo.invalid'),($2,'repartidor1@demo.invalid'),($3,'repartidor2@demo.invalid')`,
    [admin, r1, r2],
  );
  await cliente.query(readFileSync(resolve(import.meta.dirname ?? ".", "../supabase/sql/datos-demo.sql"), "utf8"));
  const producto = await cliente.query<{ id: string; precio: string }>(
    "select id, precio::text from public.productos where sku = 'DEMO-BUJ-01'",
  );
  return {
    admin,
    repartidor1: r1,
    repartidor2: r2,
    producto: { id: producto.rows[0].id, precio: Number(producto.rows[0].precio) },
  };
}

export function firmarAviso(cuerpo: string, id = `msg_${crypto.randomUUID()}`, fecha = new Date()): Headers {
  const webhook = new Webhook(SECRETO_LOCAL);
  const firma = webhook.sign(id, fecha, cuerpo);
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(fecha.getTime() / 1000)),
    "webhook-signature": firma,
  });
}

export function payloadQr(parcial: Record<string, unknown>): string {
  // CLABE ficticia de ceros: solo para forma del payload; no es una cuenta real.
  const base = {
    amount: 0.01,
    apiKeyId: "api_demo",
    bankAccountId: "ba_demo",
    codiQrId: "qr_demo",
    concept: "Refacciones pedido 1 · Empresa Demo",
    datePaid: Math.floor(Date.now() / 1000),
    numRef: "1",
    transactionId: `tx_${crypto.randomUUID().replace(/-/g, "").slice(0, 26)}`,
    type: "codi.qr.payment_received",
    metadata: {
      clabe: "000000000000000000",
      bankCode: "012",
      accountType: "40",
      trackingKey: "rastreo_demo",
      externalMetadata: {},
    },
  };
  return JSON.stringify(deepMerge(base, parcial));
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const salida = { ...a };
  for (const [clave, valor] of Object.entries(b)) {
    if (valor && typeof valor === "object" && !Array.isArray(valor) && typeof a[clave] === "object" && a[clave]) {
      salida[clave] = deepMerge(a[clave] as Record<string, unknown>, valor as Record<string, unknown>);
    } else {
      salida[clave] = valor;
    }
  }
  return salida;
}
