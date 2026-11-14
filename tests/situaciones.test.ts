import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Client } from "pg";
import { procesarAviso } from "../supabase/functions/_shared/procesar-aviso.ts";
import {
  SECRETO_LOCAL,
  abortarSiNube,
  clientePrueba,
  firmarAviso,
  payloadQr,
  reiniciarBase,
  sembrarDemo,
} from "./helpers.ts";

describe("doce situaciones en Postgres 16 local", () => {
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

  async function crearPedido(repartidor = demo.repartidor1, cantidad = 1) {
    const op = crypto.randomUUID();
    const res = await db.query(
      `select public.crear_pedido_con_cobro($1::uuid, $2::uuid, $3, $4::jsonb, 15) as r`,
      [op, repartidor, "Cliente Demo", JSON.stringify([{ producto_id: demo.producto.id, cantidad }])],
    );
    return res.rows[0].r as {
      pedido_id: string;
      cobro_id: string;
      folio: number;
      importe: number;
    };
  }

  async function crearIntento(cobroId: string, actor = demo.repartidor1) {
    const op = crypto.randomUUID();
    const res = await db.query(
      `select public.crear_intento($1::uuid, $2::uuid, 'qr', $3) as r`,
      [op, cobroId, actor],
    );
    const r = res.rows[0].r as { intento_id: string; num_ref: string; monto: number };
    await db.query(`select public.registrar_intento_pey($1::uuid, $2, $2)`, [
      r.intento_id,
      `qr_${r.intento_id.slice(0, 8)}`,
    ]);
    return { ...r, pey_qr: `qr_${r.intento_id.slice(0, 8)}` };
  }

  it("1-3 pedido, intento y pago exacto", async () => {
    const pedido = await crearPedido();
    const intento = await crearIntento(pedido.cobro_id);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','rastreo1','40',$6) as r`,
      [`tx_ok_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    assert.equal(pago.rows[0].r.resultado, "aplicado");
    assert.ok(pago.rows[0].r.comprobante_clave);
    const cobro = await db.query(`select estado from public.cobros where id = $1`, [pedido.cobro_id]);
    assert.equal(cobro.rows[0].estado, "pagado");
  });

  it("4 monto distinto", async () => {
    const pedido = await crearPedido();
    const intento = await crearIntento(pedido.cobro_id);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,0.99,now(),$2::uuid,$3::uuid,$4,'012','0001','r','40',$5) as r`,
      [`tx_md_${pedido.folio}`, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    assert.equal(pago.rows[0].r.resultado, "monto_distinto");
  });

  it("5 duplicado", async () => {
    const pedido = await crearPedido();
    const intento = await crearIntento(pedido.cobro_id);
    await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6)`,
      [`tx_dup_a_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    const segundo = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6) as r`,
      [`tx_dup_b_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    assert.equal(segundo.rows[0].r.resultado, "duplicado");
  });

  it("6 sin cobro", async () => {
    const pago = await db.query(
      `select public.conciliar_pago('webhook','tx_sin',0.01,now(),null,null,'9999999','012','0001','r','40',null) as r`,
    );
    assert.equal(pago.rows[0].r.resultado, "sin_cobro");
  });

  it("7 pago tardío con aceptación", async () => {
    const pedido = await crearPedido();
    const intento = await crearIntento(pedido.cobro_id);
    await db.query(`update public.intentos_pago set expira_en = now() - interval '2 minutes' where id = $1`, [
      intento.intento_id,
    ]);
    await db.query(`update public.cobros set vigencia_hasta = now() - interval '1 minute', estado = 'vencido' where id = $1`, [
      pedido.cobro_id,
    ]);
    await db.query(`update public.pedidos set estado = 'cancelado' where id = $1`, [pedido.pedido_id]);
    await db.query(`select public.liberar_pedido($1::uuid, 'sistema')`, [pedido.pedido_id]);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6) as r`,
      [`tx_tarde_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    assert.equal(pago.rows[0].r.resultado, "fuera_de_vigencia");
    const op = crypto.randomUUID();
    const resuelto = await db.query(
      `select public.resolver_pago($1::uuid, $2::uuid, 'aceptar', 'Pago tardío aceptado', $3) as r`,
      [op, pago.rows[0].r.pago_id, demo.admin],
    );
    assert.equal(resuelto.rows[0].r.accion, "aceptar");
  });

  it("8 cancelación con devolución", async () => {
    const pedido = await crearPedido();
    const intento = await crearIntento(pedido.cobro_id);
    const opCancel = crypto.randomUUID();
    await db.query(`select public.cancelar_pedido($1::uuid, $2::uuid, $3)`, [
      opCancel,
      pedido.pedido_id,
      demo.repartidor1,
    ]);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6) as r`,
      [`tx_can_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    assert.equal(pago.rows[0].r.resultado, "cobro_cancelado");
    const opDev = crypto.randomUUID();
    await db.query(
      `select public.resolver_pago($1::uuid, $2::uuid, 'devolver', 'Se devolverá al cliente', $3)`,
      [opDev, pago.rows[0].r.pago_id, demo.admin],
    );
    const opOk = crypto.randomUUID();
    const fin = await db.query(
      `select public.resolver_pago($1::uuid, $2::uuid, 'devuelto', 'Ya se devolvió al banco', $3) as r`,
      [opOk, pago.rows[0].r.pago_id, demo.admin],
    );
    assert.equal(fin.rows[0].r.accion, "devuelto");
  });

  it("9 entrega baja el stock", async () => {
    const antes = await db.query(
      `select coalesce(sum(existencia - apartado),0)::int as d from public.v_stock_repartidor
       where repartidor_id = $1 and producto_id = $2`,
      [demo.repartidor1, demo.producto.id],
    );
    const pedido = await crearPedido(demo.repartidor1, 2);
    const intento = await crearIntento(pedido.cobro_id);
    await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6)`,
      [`tx_ent_${pedido.folio}`, pedido.importe, intento.intento_id, pedido.cobro_id, intento.num_ref, intento.pey_qr],
    );
    const op = crypto.randomUUID();
    await db.query(`select public.marcar_entregado($1::uuid, $2::uuid, $3::uuid)`, [
      op,
      pedido.pedido_id,
      demo.repartidor1,
    ]);
    const despues = await db.query(
      `select coalesce(sum(existencia - apartado),0)::int as d from public.v_stock_repartidor
       where repartidor_id = $1 and producto_id = $2`,
      [demo.repartidor1, demo.producto.id],
    );
    assert.equal(despues.rows[0].d, antes.rows[0].d - 2);
  });

  it("10 falta de stock", async () => {
    await assert.rejects(
      () => crearPedido(demo.repartidor2, 999),
      /SIN_EXISTENCIA/,
    );
  });

  it("11 límite de intentos", async () => {
    const pedido = await crearPedido(demo.repartidor2);
    for (let i = 0; i < 5; i++) {
      await crearIntento(pedido.cobro_id, demo.repartidor2);
      // Solo se admite un intento vivo por cobro: se vence el anterior antes de pedir otro.
      await db.query(
        `update public.intentos_pago set expira_en = now() - interval '1 hour' where cobro_id = $1`,
        [pedido.cobro_id],
      );
    }
    await assert.rejects(async () => {
      const op = crypto.randomUUID();
      await db.query(`select public.crear_intento($1::uuid, $2::uuid, 'qr', $3)`, [
        op,
        pedido.cobro_id,
        demo.repartidor2,
      ]);
    }, /LIMITE_DE_INTENTOS/);
  });

  it("un solo intento vigente por cobro: el segundo se rechaza con INTENTO_VIGENTE", async () => {
    const pedido = await crearPedido(demo.repartidor1);
    await crearIntento(pedido.cobro_id);
    await assert.rejects(async () => {
      await db.query(`select public.crear_intento($1::uuid, $2::uuid, 'qr', $3)`, [
        crypto.randomUUID(),
        pedido.cobro_id,
        demo.repartidor1,
      ]);
    }, /INTENTO_VIGENTE/);
    await db.query(
      `update public.intentos_pago set expira_en = now() - interval '1 hour' where cobro_id = $1`,
      [pedido.cobro_id],
    );
    const nuevo = await crearIntento(pedido.cobro_id);
    assert.ok(nuevo.intento_id);
  });

  it("12 alteración de bitácora se detecta", async () => {
    await db.query("alter table public.bitacora disable trigger bitacora_no_modificar");
    await db.query(
      "update public.bitacora set actor = 'alterado' where id = (select min(id) from public.bitacora)",
    );
    await db.query("alter table public.bitacora enable trigger bitacora_no_modificar");
    const integridad = await db.query(`select * from public.verificar_integridad()`);
    const cadena = integridad.rows.find((fila) => String(fila.prueba).includes("Cadena"));
    assert.equal(cadena?.ok, false);
  });

  it("anon no puede leer tablas", async () => {
    await assert.rejects(async () => {
      await db.query("set role anon; select count(*) from public.pedidos; reset role;");
    }, /permission denied|permiso denegado|no tiene permiso|permission/i);
    await db.query("reset role").catch(() => undefined);
  });

  it("repite operacion_id sin duplicar pedido", async () => {
    const op = crypto.randomUUID();
    const a = await db.query(
      `select public.crear_pedido_con_cobro($1::uuid, $2::uuid, 'Alias', $3::jsonb, 15) as r`,
      [op, demo.repartidor1, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }])],
    );
    const b = await db.query(
      `select public.crear_pedido_con_cobro($1::uuid, $2::uuid, 'Alias', $3::jsonb, 15) as r`,
      [op, demo.repartidor1, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }])],
    );
    assert.equal(a.rows[0].r.pedido_id, b.rows[0].r.pedido_id);
  });

  it("procesarAviso: firma inválida no cambia cobros; idempotencia por webhook-id", async () => {
    const pedido = await crearPedido(demo.repartidor1);
    const intento = await crearIntento(pedido.cobro_id);
    const cuerpo = payloadQr({
      amount: Number(pedido.importe),
      numRef: intento.num_ref,
      codiQrId: intento.pey_qr,
      metadata: {
        clabe: "000000000000000000",
        bankCode: "012",
        accountType: "40",
        trackingKey: "sim",
        externalMetadata: { intento_id: intento.intento_id, cobro_id: pedido.cobro_id },
      },
    });
    const eventos: Array<Record<string, unknown>> = [];
    const base = {
      async reclamarEvento(evento: { webhookId: string }) {
        const previo = eventos.find((fila) => fila.webhookId === evento.webhookId);
        if (previo?.procesado) return "procesado" as const;
        if (previo) return "pendiente" as const;
        eventos.push({ webhookId: evento.webhookId, procesado: false });
        return "nuevo" as const;
      },
      async cerrarEvento(webhookId: string, resultado: string) {
        const fila = eventos.find((e) => e.webhookId === webhookId);
        if (fila) {
          fila.procesado = true;
          fila.resultado = resultado;
        }
      },
      async bitacora() {},
      async conciliar() {
        const r = await db.query(
          `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0000','sim','40',$6) as r`,
          [
            JSON.parse(cuerpo).transactionId,
            pedido.importe,
            intento.intento_id,
            pedido.cobro_id,
            intento.num_ref,
            intento.pey_qr,
          ],
        );
        return { resultado: r.rows[0].r.resultado as string };
      },
    };

    const mala = await procesarAviso({
      cuerpo,
      encabezados: new Headers({
        "webhook-id": "msg_mala",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,aaaa",
      }),
      secreto: SECRETO_LOCAL,
      base: base as never,
      confirmar: async () => ({ status: "PAID", amount: Number(pedido.importe) }),
    });
    assert.equal(mala.estado, 401);
    const cobroTrasMala = await db.query(`select estado from public.cobros where id = $1`, [pedido.cobro_id]);
    assert.notEqual(cobroTrasMala.rows[0].estado, "pagado");

    const headers = firmarAviso(cuerpo, "msg_buena");
    const buena = await procesarAviso({
      cuerpo,
      encabezados: headers,
      secreto: SECRETO_LOCAL,
      base: base as never,
      confirmar: async () => ({ status: "PAID", amount: Number(pedido.importe) }),
    });
    assert.equal(buena.estado, 200);
    assert.equal(buena.cuerpo.resultado, "aplicado");

    const otra = await procesarAviso({
      cuerpo,
      encabezados: headers,
      secreto: SECRETO_LOCAL,
      base: base as never,
      confirmar: async () => ({ status: "PAID", amount: Number(pedido.importe) }),
    });
    assert.equal(otra.cuerpo.resultado, "ya_procesado");
  });

  it("procesarAviso: con firma inválida no toca ningún método de la base y responde 401", async () => {
    const llamadas: string[] = [];
    const registrar = (nombre: string) => async () => {
      llamadas.push(nombre);
      return "nuevo" as never;
    };
    const base = {
      reclamarEvento: registrar("reclamarEvento"),
      cerrarEvento: registrar("cerrarEvento"),
      bitacora: registrar("bitacora"),
      guardarEvento: registrar("guardarEvento"),
      conciliar: registrar("conciliar"),
    };
    const cuerpo = payloadQr({ amount: 0.01 });
    const casos: Array<[string, Headers]> = [
      ["firma incorrecta", new Headers({
        "webhook-id": "msg_x",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,aaaa",
      })],
      ["sin encabezados", new Headers()],
      ["fecha vieja", firmarAviso(cuerpo, "msg_vieja", new Date(Date.now() - 10 * 60 * 1000))],
    ];
    for (const [nombre, encabezados] of casos) {
      const salida = await procesarAviso({
        cuerpo,
        encabezados,
        secreto: SECRETO_LOCAL,
        base: base as never,
        confirmar: async () => {
          llamadas.push("confirmar");
          return { status: "PAID", amount: 0.01 };
        },
      });
      assert.equal(salida.estado, 401, nombre);
    }
    assert.deepEqual(llamadas, []);
    const filas = await db.query(`select count(*)::int as n from public.eventos_pey`);
    assert.equal(filas.rows[0].n, 0);
  });
});
