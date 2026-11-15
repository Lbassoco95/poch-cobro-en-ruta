import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Client } from "pg";
import { abortarSiNube, clientePrueba, reiniciarBase, sembrarDemo } from "./helpers.ts";

describe("ruta de entrega y evidencia", () => {
  let db: Client;
  let demo: Awaited<ReturnType<typeof sembrarDemo>>;

  before(async () => {
    const { Client } = await import("pg");
    abortarSiNube(process.env.DATABASE_URL);
    const bootstrap = new Client({
      host: process.env.PGHOST ?? "/var/run/postgresql",
      database: "postgres",
      user: process.env.PGUSER ?? process.env.USER,
    });
    await bootstrap.connect();
    await bootstrap.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = 'poch_pruebas' and pid <> pg_backend_pid()");
    await bootstrap.query("drop database if exists poch_pruebas");
    await bootstrap.query("create database poch_pruebas");
    await bootstrap.end();
    db = await clientePrueba();
    await reiniciarBase(db);
    demo = await sembrarDemo(db);
  });

  after(async () => {
    await db?.end();
  });

  it("flujo ruta → documento → cobro → pago → entrega → cierre", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const ruta = await db.query(
      `select public.crear_ruta($1::uuid, $2::uuid, 'Ruta prueba', $3::date, $4) as r`,
      [crypto.randomUUID(), demo.repartidor1, hoy, demo.admin],
    );
    const rutaId = ruta.rows[0].r.ruta_id as string;
    const doc = await db.query(
      `select public.cargar_documento($1::uuid, $2::uuid, 'remision', 'R-1', 'Cliente Ruta', $3::jsonb, $4, 'OC-9') as r`,
      [
        crypto.randomUUID(),
        rutaId,
        JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]),
        demo.admin,
      ],
    );
    const pedidoId = doc.rows[0].r.pedido_id as string;
    assert.equal(doc.rows[0].r.parada, 1);

    const cobro = await db.query(
      `select public.abrir_cobro($1::uuid, $2::uuid, $3::uuid, 15) as r`,
      [crypto.randomUUID(), pedidoId, demo.repartidor1],
    );
    const cobroId = cobro.rows[0].r.cobro_id as string;
    const intento = await db.query(
      `select public.crear_intento($1::uuid, $2::uuid, 'qr', $3) as r`,
      [crypto.randomUUID(), cobroId, demo.repartidor1],
    );
    await db.query(`select public.registrar_intento_pey($1::uuid, 'qr_ruta', 'qr_ruta')`, [
      intento.rows[0].r.intento_id,
    ]);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40','qr_ruta') as r`,
      [
        `tx_ruta_${pedidoId.slice(0, 8)}`,
        Number(intento.rows[0].r.monto),
        intento.rows[0].r.intento_id,
        cobroId,
        intento.rows[0].r.num_ref,
      ],
    );
    assert.equal(pago.rows[0].r.resultado, "aplicado");

    const entrega = await db.query(
      `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,'Ana',$4,$5,$6,$7,null,null,19.4,-99.1) as r`,
      [
        crypto.randomUUID(),
        pedidoId,
        demo.repartidor1,
        `evidencias/${pedidoId}/foto.jpg`,
        "c".repeat(64),
        `evidencias/${pedidoId}/firma.png`,
        "d".repeat(64),
      ],
    );
    assert.equal(entrega.rows[0].r.estado, "entregado");
    assert.equal(entrega.rows[0].r.requiere_revision, false);

    const cierre = await db.query(`select public.cerrar_ruta($1::uuid, $2::uuid, $3) as r`, [
      crypto.randomUUID(),
      rutaId,
      demo.admin,
    ]);
    assert.equal(cierre.rows[0].r.entregados, 1);
    assert.equal(cierre.rows[0].r.devueltos, 0);
    const rutaCerrada = await db.query(`select estado from public.rutas where id = $1`, [rutaId]);
    assert.equal(rutaCerrada.rows[0].estado, "cerrada");

    const integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.equal(integridad.rows.length, 5);
    assert.ok(integridad.rows.every((fila) => fila.ok === true));
  });

  it("evidencia incompleta y excepción con revisión", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const ruta = await db.query(
      `select public.crear_ruta($1::uuid, $2::uuid, 'Ruta 2', $3::date, $4) as r`,
      [crypto.randomUUID(), demo.repartidor2, hoy, demo.admin],
    );
    const doc = await db.query(
      `select public.cargar_documento($1::uuid, $2::uuid, 'remision', 'R-2', 'Cliente 2', $3::jsonb, $4, 'OC-2') as r`,
      [
        crypto.randomUUID(),
        ruta.rows[0].r.ruta_id,
        JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]),
        demo.admin,
      ],
    );
    const pedidoId = doc.rows[0].r.pedido_id as string;
    const cobro = await db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,15) as r`, [
      crypto.randomUUID(),
      pedidoId,
      demo.repartidor2,
    ]);
    const intento = await db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3) as r`, [
      crypto.randomUUID(),
      cobro.rows[0].r.cobro_id,
      demo.repartidor2,
    ]);
    await db.query(`select public.registrar_intento_pey($1::uuid,'qr2','qr2')`, [intento.rows[0].r.intento_id]);
    await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40','qr2')`,
      [
        `tx2_${pedidoId.slice(0, 8)}`,
        Number(intento.rows[0].r.monto),
        intento.rows[0].r.intento_id,
        cobro.rows[0].r.cobro_id,
        intento.rows[0].r.num_ref,
      ],
    );

    await assert.rejects(
      () =>
        db.query(
          `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,'Ana',null,null,null,null,null,null,null,null)`,
          [crypto.randomUUID(), pedidoId, demo.repartidor2],
        ),
      /EVIDENCIA_INCOMPLETA/,
    );

    const conEx = await db.query(
      `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,'Ana',$4,$5,null,null,'cliente_no_firma','No quiso firmar',null,null) as r`,
      [
        crypto.randomUUID(),
        pedidoId,
        demo.repartidor2,
        `evidencias/${pedidoId}/foto.jpg`,
        "e".repeat(64),
      ],
    );
    assert.equal(conEx.rows[0].r.requiere_revision, true);
    const rev = await db.query(`select public.revisar_entrega($1::uuid,$2::uuid,'Revisado OK', $3) as r`, [
      crypto.randomUUID(),
      pedidoId,
      demo.admin,
    ]);
    assert.equal(rev.rows[0].r.revisada, true);
  });

  it("devolución, INTENTO_VIGENTE, duplicado y reorden", async () => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const ruta = await db.query(
      `select public.crear_ruta($1::uuid, $2::uuid, 'Ruta 3', $3::date, $4) as r`,
      [crypto.randomUUID(), demo.repartidor1, hoy, demo.admin],
    );
    const rutaId = ruta.rows[0].r.ruta_id as string;
    const a = await db.query(
      `select public.cargar_documento($1::uuid,$2::uuid,'remision','R-3a','A',$3::jsonb,$4,'OC-a') as r`,
      [crypto.randomUUID(), rutaId, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]), demo.admin],
    );
    const b = await db.query(
      `select public.cargar_documento($1::uuid,$2::uuid,'remision','R-3b','B',$3::jsonb,$4,'OC-b') as r`,
      [crypto.randomUUID(), rutaId, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]), demo.admin],
    );
    await assert.rejects(
      () =>
        db.query(
          `select public.cargar_documento($1::uuid,$2::uuid,'remision','R-3a','A',$3::jsonb,$4,null)`,
          [crypto.randomUUID(), rutaId, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]), demo.admin],
        ),
      /DOCUMENTO_DUPLICADO/,
    );

    const orden = [b.rows[0].r.pedido_id, a.rows[0].r.pedido_id];
    const reorden = await db.query(
      `select public.reordenar_paradas($1::uuid,$2::uuid,$3::uuid,$4::uuid[],'Cliente B primero') as r`,
      [crypto.randomUUID(), rutaId, demo.repartidor1, orden],
    );
    assert.deepEqual(reorden.rows[0].r.antes, ["R-3a", "R-3b"]);
    assert.deepEqual(reorden.rows[0].r.despues, ["R-3b", "R-3a"]);

    const cobro = await db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,15) as r`, [
      crypto.randomUUID(),
      a.rows[0].r.pedido_id,
      demo.repartidor1,
    ]);
    await db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3)`, [
      crypto.randomUUID(),
      cobro.rows[0].r.cobro_id,
      demo.repartidor1,
    ]);
    await assert.rejects(
      () =>
        db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3)`, [
          crypto.randomUUID(),
          cobro.rows[0].r.cobro_id,
          demo.repartidor1,
        ]),
      /INTENTO_VIGENTE/,
    );

    const dev = await db.query(
      `select public.devolver_documento($1::uuid,$2::uuid,'Cliente ausente hoy',$3) as r`,
      [crypto.randomUUID(), b.rows[0].r.pedido_id, demo.repartidor1],
    );
    assert.equal(dev.rows[0].r.estado, "devuelto");
  });
});
