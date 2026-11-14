import { z } from "npm:zod";

const uuid = z.string().uuid();

export const esquemaPedido = z.object({
  operacion_id: uuid,
  cliente_alias: z.string().trim().min(1).max(60),
  lineas: z.array(z.object({
    producto_id: uuid,
    cantidad: z.number().int().positive().max(1000),
  })).min(1).max(30),
  vigencia_min: z.number().int().min(6).max(120).optional(),
});

export const esquemaIntento = z.object({
  operacion_id: uuid,
  cobro_id: uuid,
  metodo: z.enum(["qr", "push"]),
  celular: z.string().regex(/^[0-9]{10}$/).optional(),
}).superRefine((valor, ctx) => {
  if (valor.metodo === "push" && !valor.celular) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "celular" });
  }
});

export const esquemaPedidoId = z.object({
  pedido_id: uuid,
  operacion_id: uuid.optional(),
});

export const esquemaEntrega = z.object({
  operacion_id: uuid,
  pedido_id: uuid,
});

export const esquemaResolver = z.object({
  operacion_id: uuid,
  pago_id: uuid,
  accion: z.enum(["aceptar", "devolver", "devuelto"]),
  nota: z.string().trim().min(5).max(300),
});

export const esquemaTablero = z.object({
  pedido_id: uuid.optional(),
  estado: z.enum(["por_cobrar", "pagado", "entregado", "cancelado"]).optional(),
  repartidor_id: uuid.optional(),
});

export function validar<T>(esquema: z.ZodType<T>, dato: unknown): T {
  const resultado = esquema.safeParse(dato);
  if (!resultado.success) throw new Error("SOLICITUD_INVALIDA");
  return resultado.data;
}
