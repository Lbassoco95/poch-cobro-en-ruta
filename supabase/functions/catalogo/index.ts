import { exigir } from "../_shared/auth.ts";
import { json, servir } from "../_shared/http.ts";

servir(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Método no permitido." });
  const { cliente, perfil } = await exigir(req, ["repartidor", "admin"]);
  const { data: productos, error } = await cliente
    .from("productos")
    .select("id, sku, nombre, precio")
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  if (perfil.rol === "admin") {
    return json(200, { productos: productos ?? [] });
  }
  const { data: stock, error: errorStock } = await cliente
    .from("v_stock_repartidor")
    .select("producto_id, existencia, apartado")
    .eq("repartidor_id", perfil.user_id);
  if (errorStock) throw new Error(errorStock.message);
  const porProducto = new Map((stock ?? []).map((fila) => [fila.producto_id, fila]));
  return json(200, {
    productos: (productos ?? []).map((producto) => {
      const movimiento = porProducto.get(producto.id);
      const existencia = movimiento?.existencia ?? 0;
      const apartado = movimiento?.apartado ?? 0;
      return { ...producto, existencia, apartado, disponible: existencia - apartado };
    }),
  });
});
