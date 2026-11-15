import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Client } from "pg";
import { abortarSiNube, clientePrueba, reiniciarBase, sembrarDemo } from "./helpers.ts";

// Pruebas de Fase 2 escritas en revisión. Solo corren contra Postgres 16 local.
describe("Fase 2: casos de revisión (ruta, evidencia, reorden, ajenos)", () => {
  let db: Client;
  let demo: Awaited<ReturnType<typeof sembrarDemo>>;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const uuid = () => crypto.randomUUID();

  before(async () => {
    const { Client } = await import("pg");
    abortarSiNube(process.env.DATABASE_URL);
    const bootstrap = new Client({
      host: process.env.PGHOST ?? "/var/run/postgresql",
      database: "postgres",
      user: process.env.PGUSER ?? process.env.USER,
    });
    await bootstrap.connect();
    await bootstrap.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'poch_pruebas' and pid <> pg_backend_pid()",
    );
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

  async function nuevaRuta(repartidor: string, nombre = "Ruta") {
    const r = await db.query(`select public.crear_ruta($1::uuid,$2::uuid,$3,$4::date,$5) as r`, [
      uuid(),
      repartidor,
      nombre,
      hoy,
      demo.admin,
    ]);
    return r.rows[0].r.ruta_id as string;
  }

  async function nuevoDocumento(ruta: string, folio: string, oc: string | null = null) {
    const r = await db.query(
      `select public.cargar_documento($1::uuid,$2::uuid,'remision',$3,'Cliente',$4::jsonb,$5,$6) as r`,
      [uuid(), ruta, folio, JSON.stringify([{ producto_id: demo.producto.id, cantidad: 1 }]), demo.admin, oc],
    );
    return r.rows[0].r as { pedido_id: string; parada: number };
  }

  async function abrir(pedido: string, repartidor: string): Promise<{ cobro_id: string; reabierto: boolean }> {
    const r = await db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,15) as r`, [
      uuid(),
      pedido,
      repartidor,
    ]);
    return r.rows[0].r;
  }

  async function pagar(pedido: string, repartidor: string) {
    const cobro = await abrir(pedido, repartidor);
    const intento = await db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3) as r`, [
      uuid(),
      cobro.cobro_id,
      repartidor,
    ]);
    const i = intento.rows[0].r;
    const qr = `qr_${i.intento_id.slice(0, 8)}`;
    await db.query(`select public.registrar_intento_pey($1::uuid,$2,$2)`, [i.intento_id, qr]);
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','r','40',$6) as r`,
      [`tx_${i.intento_id.slice(0, 12)}`, Number(i.monto), i.intento_id, cobro.cobro_id, i.num_ref, qr],
    );
    assert.equal(pago.rows[0].r.resultado, "aplicado");
    return cobro.cobro_id;
  }

  async function entregar(pedido: string, repartidor: string) {
    await db.query(
      `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,'Ana',$4,$5,$6,$7,null,null,null,null)`,
      [uuid(), pedido, repartidor, `evidencias/${pedido}/foto.jpg`, "a".repeat(64), `evidencias/${pedido}/firma.png`, "b".repeat(64)],
    );
  }

  it("vencimiento que reabre: el documento vuelve a pendiente, conserva el apartado y se puede reabrir", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Vence");
    const doc = await nuevoDocumento(ruta, "V-1");
    const cobro = await abrir(doc.pedido_id, demo.repartidor1);
    await db.query(`update public.cobros set vigencia_hasta = now() - interval '1 minute' where id = $1`, [cobro.cobro_id]);
    const exp = await db.query(`select public.expirar_vencidos() as r`);
    assert.equal(exp.rows[0].r.cobros_vencidos, 1);
    const tras = await db.query(
      `select p.estado as pedido, c.estado as cobro from public.pedidos p join public.cobros c on c.pedido_id = p.id where p.id = $1`,
      [doc.pedido_id],
    );
    assert.equal(tras.rows[0].pedido, "pendiente");
    assert.equal(tras.rows[0].cobro, "vencido");
    let integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.ok(integridad.rows.every((f) => f.ok), "integridad tras vencer");

    const reabierto = await abrir(doc.pedido_id, demo.repartidor1);
    assert.equal(reabierto.cobro_id, cobro.cobro_id, "reabre el mismo cobro");
    assert.equal(reabierto.reabierto, true);
    const despues = await db.query(
      `select p.estado as pedido, c.estado as cobro, c.vigencia_hasta > now() as vigente from public.pedidos p join public.cobros c on c.pedido_id = p.id where p.id = $1`,
      [doc.pedido_id],
    );
    assert.deepEqual(
      { ...despues.rows[0] },
      { pedido: "por_cobrar", cobro: "emitido", vigente: true },
    );
    integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.ok(integridad.rows.every((f) => f.ok), "integridad tras reabrir");
  });

  it("repartidor ajeno rechazado en cobro, entrega y reorden", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Ajena");
    const doc = await nuevoDocumento(ruta, "A-1");
    await assert.rejects(
      () => db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,15)`, [uuid(), doc.pedido_id, demo.repartidor2]),
      /DOCUMENTO_NO_ENCONTRADO/,
    );
    await pagar(doc.pedido_id, demo.repartidor1);
    await assert.rejects(
      () =>
        db.query(
          `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,'Ana',$4,$5,$6,$7,null,null,null,null)`,
          [uuid(), doc.pedido_id, demo.repartidor2, "x", "a".repeat(64), "y", "b".repeat(64)],
        ),
      /PEDIDO_NO_ENCONTRADO/,
    );
    await assert.rejects(
      () =>
        db.query(`select public.reordenar_paradas($1::uuid,$2::uuid,$3::uuid,$4::uuid[],'intento ajeno')`, [
          uuid(),
          ruta,
          demo.repartidor2,
          [doc.pedido_id],
        ]),
      /RUTA_NO_ENCONTRADA/,
    );
  });

  it("reordenar: solo pendientes o por cobrar, motivo de 5+ caracteres, sin choque de paradas y con bitácora de antes y después", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Reorden");
    const a = await nuevoDocumento(ruta, "O-a");
    const b = await nuevoDocumento(ruta, "O-b");
    const c = await nuevoDocumento(ruta, "O-c");
    const reordenar = (orden: string[], motivo: string, repartidor = demo.repartidor1) =>
      db.query(`select public.reordenar_paradas($1::uuid,$2::uuid,$3::uuid,$4::uuid[],$5) as r`, [
        uuid(),
        ruta,
        repartidor,
        orden,
        motivo,
      ]);

    await assert.rejects(() => reordenar([c.pedido_id, b.pedido_id, a.pedido_id], "abc"), /MOTIVO_OBLIGATORIO/);
    await assert.rejects(() => reordenar([c.pedido_id, b.pedido_id], "Falta uno"), /ORDEN_INVALIDO/);
    await assert.rejects(() => reordenar([c.pedido_id, c.pedido_id, b.pedido_id], "Repetido"), /ORDEN_INVALIDO/);
    await assert.rejects(() => reordenar([c.pedido_id, b.pedido_id, uuid()], "Ajeno al orden"), /ORDEN_INVALIDO/);
    await assert.rejects(() => reordenar([a.pedido_id, b.pedido_id, c.pedido_id], "Mismo orden"), /SIN_CAMBIOS/);

    const ok = await reordenar([c.pedido_id, a.pedido_id, b.pedido_id], "Calle cerrada al norte");
    assert.deepEqual(ok.rows[0].r.antes, ["O-a", "O-b", "O-c"]);
    assert.deepEqual(ok.rows[0].r.despues, ["O-c", "O-a", "O-b"]);
    const bit = await db.query(
      `select detalle from public.bitacora where accion = 'ruta_reordenada' and detalle->>'ruta_id' = $1 order by id desc limit 1`,
      [ruta],
    );
    assert.deepEqual(bit.rows[0].detalle.antes, ["O-a", "O-b", "O-c"]);
    assert.deepEqual(bit.rows[0].detalle.despues, ["O-c", "O-a", "O-b"]);
    assert.equal(bit.rows[0].detalle.motivo, "Calle cerrada al norte");

    // Una parada ya pagada y entregada deja de ser movible y conserva su lugar.
    await pagar(a.pedido_id, demo.repartidor1);
    await entregar(a.pedido_id, demo.repartidor1);
    const lugarDeA = (await db.query(`select parada from public.pedidos where id = $1`, [a.pedido_id])).rows[0].parada;
    await assert.rejects(() => reordenar([c.pedido_id, a.pedido_id, b.pedido_id], "Incluye entregada"), /ORDEN_INVALIDO/);
    const dos = await reordenar([b.pedido_id, c.pedido_id], "Solo las pendientes");
    assert.deepEqual(dos.rows[0].r.despues, ["O-b", "O-c"]);
    const filas = await db.query(`select id, parada from public.pedidos where ruta_id = $1`, [ruta]);
    const paradas = filas.rows.map((f) => f.parada);
    assert.equal(new Set(paradas).size, paradas.length, `paradas repetidas: ${paradas.join(",")}`);
    assert.equal(filas.rows.find((f) => f.id === a.pedido_id).parada, lugarDeA, "la entregada conserva su lugar");
  });

  it("orden de compra de origen queda en el documento y en la bitácora; más de 40 caracteres se rechaza", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "OC");
    const con = await nuevoDocumento(ruta, "OC-1", "  OC-7788  ");
    const sin = await nuevoDocumento(ruta, "OC-2", "   ");
    const filas = await db.query(`select id, orden_compra_ref from public.pedidos where id = any($1::uuid[])`, [
      [con.pedido_id, sin.pedido_id],
    ]);
    const por = new Map(filas.rows.map((f) => [f.id, f]));
    assert.equal(por.get(con.pedido_id).orden_compra_ref, "OC-7788");
    assert.equal(por.get(sin.pedido_id).orden_compra_ref, null);
    await assert.rejects(() => nuevoDocumento(ruta, "OC-3", "X".repeat(41)), /ORDEN_COMPRA_INVALIDA/);
    const bit = await db.query(
      `select detalle from public.bitacora where accion = 'documento_cargado' and pedido_id = $1`,
      [con.pedido_id],
    );
    assert.equal(bit.rows[0].detalle.orden_compra, "OC-7788");
  });

  it("evidencia: rechaza lo incompleto; la excepción pide nota y queda para revisión; no se altera después", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Evidencia");
    const doc = await nuevoDocumento(ruta, "E-1");
    await pagar(doc.pedido_id, demo.repartidor1);
    const entrega = (excepcion: string | null, nota: string | null, foto: boolean, firma: boolean, recibe = "Ana", hash = "a".repeat(64)) =>
      db.query(
        `select public.marcar_entregado($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,null,null) as r`,
        [
          uuid(),
          doc.pedido_id,
          demo.repartidor1,
          recibe,
          foto ? `evidencias/${doc.pedido_id}/foto.jpg` : null,
          foto ? hash : null,
          firma ? `evidencias/${doc.pedido_id}/firma.png` : null,
          firma ? "b".repeat(64) : null,
          excepcion,
          nota,
        ],
      );
    await assert.rejects(() => entrega(null, null, true, false), /EVIDENCIA_INCOMPLETA/);
    await assert.rejects(() => entrega(null, null, false, true), /EVIDENCIA_INCOMPLETA/);
    await assert.rejects(() => entrega(null, null, true, true, "  "), /EVIDENCIA_INCOMPLETA/);
    await assert.rejects(() => entrega("inventada", "Nota larga", true, true), /EXCEPCION_INVALIDA/);
    await assert.rejects(() => entrega("sin_foto", "abc", false, true), /NOTA_OBLIGATORIA/);
    await assert.rejects(() => entrega("recibio_tercero", null, false, false), /NOTA_OBLIGATORIA/);
    await assert.rejects(() => entrega(null, null, true, true, "Ana", "no-es-un-hash"), /hash|restricci|constraint/i);

    const ok = await entrega("recibio_tercero", "Recibió el vecino", false, false);
    assert.equal(ok.rows[0].r.requiere_revision, true);

    await assert.rejects(
      () => db.query(`update public.entregas_evidencia set foto_ruta = 'otra' where pedido_id = $1`, [doc.pedido_id]),
      /no se modifica/,
    );
    await assert.rejects(
      () => db.query(`delete from public.entregas_evidencia where pedido_id = $1`, [doc.pedido_id]),
      /no se borran/,
    );

    const revisar = () =>
      db.query(`select public.revisar_entrega($1::uuid,$2::uuid,'Revisado con el cliente',$3) as r`, [
        uuid(),
        doc.pedido_id,
        demo.admin,
      ]);
    assert.equal((await revisar()).rows[0].r.revisada, true);
    await assert.rejects(() => revisar(), /ENTREGA_SIN_REVISION_PENDIENTE/);
  });

  it("devolver un documento exige motivo de 5+ caracteres y regresa la mercancía", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Devolver");
    const doc = await nuevoDocumento(ruta, "D-1");
    await assert.rejects(
      () => db.query(`select public.devolver_documento($1::uuid,$2::uuid,'no',$3)`, [uuid(), doc.pedido_id, demo.repartidor1]),
      /MOTIVO_OBLIGATORIO/,
    );
    const ok = await db.query(`select public.devolver_documento($1::uuid,$2::uuid,'Cliente cerrado hoy',$3) as r`, [
      uuid(),
      doc.pedido_id,
      demo.repartidor1,
    ]);
    assert.equal(ok.rows[0].r.estado, "devuelto");
    const integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.ok(integridad.rows.every((f) => f.ok));
  });

  it("cierre con pendientes y cancelar documento de ruta se rechazan", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Cierre");
    const doc = await nuevoDocumento(ruta, "Z-1");
    await assert.rejects(
      () => db.query(`select public.cerrar_ruta($1::uuid,$2::uuid,$3)`, [uuid(), ruta, demo.admin]),
      /RUTA_CON_PENDIENTES/,
    );
    await abrir(doc.pedido_id, demo.repartidor1);
    await assert.rejects(
      () => db.query(`select public.cancelar_pedido($1::uuid,$2::uuid,$3)`, [uuid(), doc.pedido_id, demo.repartidor1]),
      /USAR_DEVOLUCION/,
    );
  });

  it("QR vencido: en la tolerancia de 30 s no se reabre; después sí, se genera otro QR, se paga y se entrega", async () => {
    const ruta = await nuevaRuta(demo.repartidor1, "Ciclo QR");
    const doc = await nuevoDocumento(ruta, "Q-1");
    const cobro = await abrir(doc.pedido_id, demo.repartidor1);
    const crear = (repartidor = demo.repartidor1) =>
      db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3) as r`, [uuid(), cobro.cobro_id, repartidor]);
    const primero = (await crear()).rows[0].r;
    await db.query(`select public.registrar_intento_pey($1::uuid,'qr_p1','qr_p1')`, [primero.intento_id]);

    // QR vivo: otro QR se rechaza.
    await assert.rejects(() => crear(), /INTENTO_VIGENTE/);

    // Bug reproducido: la vigencia del cobro ya pasó y el QR venció hace 10 s, pero sigue la tolerancia de 30 s.
    await db.query(`update public.cobros set vigencia_hasta = now() - interval '5 seconds' where id = $1`, [cobro.cobro_id]);
    await db.query(`update public.intentos_pago set expira_en = now() - interval '10 seconds' where id = $1`, [primero.intento_id]);
    await db.query(`select public.expirar_vencidos()`);
    const enGracia = await db.query(
      `select p.estado as pedido, c.estado as cobro from public.pedidos p join public.cobros c on c.pedido_id = p.id where p.id = $1`,
      [doc.pedido_id],
    );
    assert.equal(enGracia.rows[0].pedido, "por_cobrar", "dentro de la tolerancia el documento sigue por cobrar");
    await assert.rejects(
      () => db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,6)`, [uuid(), doc.pedido_id, demo.repartidor1]),
      /DOCUMENTO_NO_PENDIENTE/,
    );
    await assert.rejects(() => crear(), /COBRO_NO_VIGENTE/);

    // Pasada la tolerancia, el cobro vence, el documento vuelve a pendiente y se puede reabrir.
    await db.query(`update public.intentos_pago set expira_en = now() - interval '40 seconds' where id = $1`, [primero.intento_id]);
    await db.query(`select public.expirar_vencidos()`);
    const vencido = await db.query(
      `select p.estado as pedido, c.estado as cobro from public.pedidos p join public.cobros c on c.pedido_id = p.id where p.id = $1`,
      [doc.pedido_id],
    );
    assert.deepEqual({ ...vencido.rows[0] }, { pedido: "pendiente", cobro: "vencido" });
    const reabierto = await db.query(`select public.abrir_cobro($1::uuid,$2::uuid,$3::uuid,6) as r`, [
      uuid(),
      doc.pedido_id,
      demo.repartidor1,
    ]);
    assert.equal(reabierto.rows[0].r.reabierto, true);
    assert.equal(reabierto.rows[0].r.cobro_id, cobro.cobro_id);

    // Segundo QR, distinto del primero, con monto igual al importe del documento y numRef válido.
    const segundo = (await crear()).rows[0].r;
    assert.notEqual(segundo.intento_id, primero.intento_id);
    assert.notEqual(segundo.num_ref, primero.num_ref);
    assert.match(String(segundo.num_ref), /^[0-9]{1,7}$/);
    const importe = (await db.query(`select importe from public.cobros where id = $1`, [cobro.cobro_id])).rows[0].importe;
    assert.equal(Number(segundo.monto), Number(importe));
    assert.ok(Number(segundo.monto) > 0);
    await db.query(`select public.registrar_intento_pey($1::uuid,'qr_p2','qr_p2')`, [segundo.intento_id]);

    // Pago por el segundo QR: se aplica; el primero ya no pesa.
    const pago = await db.query(
      `select public.conciliar_pago('webhook',$1,$2,now(),$3::uuid,$4::uuid,$5,'012','0001','rastreo','40','qr_p2') as r`,
      [`tx_ciclo_${doc.pedido_id.slice(0, 8)}`, Number(segundo.monto), segundo.intento_id, cobro.cobro_id, segundo.num_ref],
    );
    assert.equal(pago.rows[0].r.resultado, "aplicado");
    const pagado = await db.query(`select estado from public.pedidos where id = $1`, [doc.pedido_id]);
    assert.equal(pagado.rows[0].estado, "pagado");

    // Entrega con foto y firma.
    await entregar(doc.pedido_id, demo.repartidor1);
    const entregado = await db.query(`select estado from public.pedidos where id = $1`, [doc.pedido_id]);
    assert.equal(entregado.rows[0].estado, "entregado");
    const integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.ok(integridad.rows.every((f) => f.ok), "integridad tras el ciclo completo");
  });

  it("el límite de 5 intentos cuenta desde la última apertura del cobro", async () => {
    const ruta = await nuevaRuta(demo.repartidor2, "Límite");
    const doc = await nuevoDocumento(ruta, "L-1");
    const cobro = await abrir(doc.pedido_id, demo.repartidor2);
    for (let i = 0; i < 5; i++) {
      await db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3)`, [uuid(), cobro.cobro_id, demo.repartidor2]);
      await db.query(`update public.intentos_pago set expira_en = now() - interval '1 hour' where cobro_id = $1`, [cobro.cobro_id]);
    }
    await assert.rejects(
      () => db.query(`select public.crear_intento($1::uuid,$2::uuid,'qr',$3)`, [uuid(), cobro.cobro_id, demo.repartidor2]),
      /LIMITE_DE_INTENTOS/,
    );
  });

  it("al final, verificar_integridad() da las cinco pruebas en verde", async () => {
    const integridad = await db.query(`select * from public.verificar_integridad()`);
    assert.equal(integridad.rows.length, 5);
    for (const fila of integridad.rows) assert.equal(fila.ok, true, `${fila.prueba}: ${fila.detalle}`);
  });
});
