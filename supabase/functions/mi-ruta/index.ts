import { exigir } from "../_shared/auth.ts";
import { inicioDelDiaCdmx } from "../_shared/db.ts";
import { json, servir } from "../_shared/http.ts";
import { armarGrupos } from "../_shared/rutas.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor"]);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

  // Todas las rutas abiertas del repartidor, de cualquier día: una ruta sigue vigente hasta cerrarse.
  const { data: rutas, error } = await vacioSiFalla(
    cliente
      .from("rutas")
      .select("id, nombre, fecha, estado, repartidor_id")
      .eq("repartidor_id", perfil.user_id)
      .eq("estado", "abierta")
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false }),
  );
  if (error) throw new Error(error.message);
  if (!rutas.length) {
    return json(200, {
      ruta: null,
      paradas: [],
      resumen: { entregadas: 0, cobrado: 0, por_cobrar: 0 },
      siguiente_parada: null,
      rutas: [],
      dia: hoy,
    });
  }

  const { data: paradas, error: errorParadas } = await cliente
    .from("pedidos")
    .select("id, folio, cliente_alias, total, estado, parada, ruta_id, tipo_documento, folio_documento, orden_compra_ref")
    .in("ruta_id", rutas.map((r) => r.id))
    .order("parada", { ascending: true });
  if (errorParadas) throw new Error(errorParadas.message);

  const ids = (paradas ?? []).map((p) => p.id);
  const [{ data: cobros }, { data: lineas }, { data: evidencias }] = await Promise.all([
    ids.length
      ? cliente.from("cobros").select("id, pedido_id, estado, vigencia_hasta, importe").in("pedido_id", ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    ids.length
      ? cliente.from("pedido_lineas").select("pedido_id, cantidad, producto_id").in("pedido_id", ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    ids.length
      ? cliente.from("entregas_evidencia").select("pedido_id, recibe_nombre, requiere_revision").in("pedido_id", ids)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);

  const productosIds = [...new Set((lineas ?? []).map((l) => l.producto_id as string))];
  const { data: productos } = productosIds.length
    ? await cliente.from("productos").select("id, nombre").in("id", productosIds)
    : { data: [] as Array<{ id: string; nombre: string }> };
  const nombres = new Map((productos ?? []).map((p) => [p.id, p.nombre]));

  const cobroPorPedido = new Map((cobros ?? []).map((c) => [c.pedido_id as string, c]));
  const evidenciaPorPedido = new Map((evidencias ?? []).map((e) => [e.pedido_id as string, e]));
  const piezasPorPedido = new Map<string, Array<{ nombre: string; cantidad: number }>>();
  for (const linea of lineas ?? []) {
    const lista = piezasPorPedido.get(linea.pedido_id as string) ?? [];
    lista.push({ nombre: nombres.get(linea.producto_id as string) ?? "Pieza", cantidad: Number(linea.cantidad) });
    piezasPorPedido.set(linea.pedido_id as string, lista);
  }

  const ahora = Date.now();
  const lista = (paradas ?? []).map((parada) => {
    const cobro = cobroPorPedido.get(parada.id);
    const vigencia = cobro?.vigencia_hasta ? new Date(String(cobro.vigencia_hasta)).getTime() : 0;
    const vigente = Boolean(cobro && ["emitido", "en_proceso"].includes(String(cobro.estado)) && vigencia > ahora);
    return {
      ...parada,
      piezas: piezasPorPedido.get(parada.id) ?? [],
      cobro: cobro
        ? {
          id: cobro.id,
          estado: cobro.estado,
          vigencia_hasta: cobro.vigencia_hasta,
          importe: cobro.importe,
          vigente,
          segundos: vigente ? Math.max(0, Math.floor((vigencia - ahora) / 1000)) : 0,
        }
        : null,
      evidencia: evidenciaPorPedido.get(parada.id) ?? null,
    };
  });

  const grupos = armarGrupos(rutas, lista);
  const primero = grupos[0];

  return json(200, {
    // Todas las rutas abiertas, cada una con su resumen y su siguiente parada.
    rutas: grupos,
    // Campos de la primera ruta, para pantallas que aún esperan una sola.
    ruta: primero.ruta,
    paradas: primero.paradas,
    resumen: primero.resumen,
    siguiente_parada: primero.siguiente_parada,
    dia: hoy,
    desde: inicioDelDiaCdmx(),
  });
});

// Normaliza la respuesta de PostgREST: una lista siempre es una lista.
async function vacioSiFalla<T>(consulta: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await consulta;
  return { data: data ?? [], error };
}
