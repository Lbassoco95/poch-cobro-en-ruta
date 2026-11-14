import { expirar, clienteServicio, type Cliente } from "./db.ts";

export type Perfil = { user_id: string; rol: "admin" | "repartidor"; nombre: string; activo: boolean };

export async function exigir(req: Request, roles: Array<Perfil["rol"]>): Promise<{ cliente: Cliente; perfil: Perfil }> {
  const cliente = clienteServicio();
  if (!cliente) throw new Error("FUNCION_NO_CONFIGURADA");
  await expirar(cliente);
  const encabezado = req.headers.get("authorization") ?? "";
  const token = encabezado.toLowerCase().startsWith("bearer ") ? encabezado.slice(7).trim() : "";
  if (!token) throw new Error("NO_AUTENTICADO");
  const { data, error } = await cliente.auth.getUser(token);
  if (error || !data.user) throw new Error("NO_AUTENTICADO");
  const { data: perfil, error: errorPerfil } = await cliente
    .from("perfiles")
    .select("user_id, rol, nombre, activo")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (errorPerfil || !perfil?.activo) throw new Error("NO_AUTENTICADO");
  if (perfil.rol !== "admin" && perfil.rol !== "repartidor") throw new Error("SIN_PERMISO");
  if (!roles.includes(perfil.rol)) throw new Error("SIN_PERMISO");
  return { cliente, perfil: perfil as Perfil };
}

export async function asegurarPedido(
  cliente: Cliente,
  pedidoId: string,
  perfil: Perfil,
): Promise<{ id: string; repartidor_id: string; estado: string }> {
  const { data, error } = await cliente
    .from("pedidos")
    .select("id, repartidor_id, estado")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error || !data) throw new Error("PEDIDO_NO_ENCONTRADO");
  if (perfil.rol === "repartidor" && data.repartidor_id !== perfil.user_id) throw new Error("PEDIDO_NO_ENCONTRADO");
  return data;
}
