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
  recibe_nombre: z.string().trim().min(1).max(80),
  foto_ruta: z.string().min(1).max(300).nullable().optional(),
  foto_hash: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  firma_ruta: z.string().min(1).max(300).nullable().optional(),
  firma_hash: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  excepcion: z.enum(["recibio_tercero", "cliente_no_firma", "sin_foto"]).nullable().optional(),
  nota: z.string().trim().min(5).max(300).nullable().optional(),
  latitud: z.number().min(-90).max(90).nullable().optional(),
  longitud: z.number().min(-180).max(180).nullable().optional(),
});

export const esquemaResolver = z.object({
  operacion_id: uuid,
  pago_id: uuid,
  accion: z.enum(["aceptar", "devolver", "devuelto"]),
  nota: z.string().trim().min(5).max(300),
});

export const esquemaTablero = z.object({
  pedido_id: uuid.optional(),
  estado: z.enum(["pendiente", "por_cobrar", "pagado", "entregado", "devuelto", "cancelado"]).optional(),
  repartidor_id: uuid.optional(),
});

export const esquemaCrearRuta = z.object({
  operacion_id: uuid,
  repartidor_id: uuid,
  nombre: z.string().trim().min(1).max(60),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const esquemaCargarDocumento = z.object({
  operacion_id: uuid,
  ruta_id: uuid,
  tipo: z.enum(["remision", "nota_venta", "orden_compra"]),
  folio: z.string().trim().min(1).max(40),
  cliente: z.string().trim().min(1).max(60),
  zona: z.string().trim().min(1).max(60).optional(),
  orden_compra: z.string().trim().min(1).max(40).optional(),
  lineas: z.array(z.object({
    producto_id: uuid,
    cantidad: z.number().int().positive().max(1000),
  })).min(1).max(50),
});

export const esquemaAbrirCobro = z.object({
  operacion_id: uuid,
  pedido_id: uuid,
  vigencia_min: z.number().int().min(6).max(120).optional(),
});

export const esquemaSubirEvidencia = z.object({
  pedido_id: uuid,
});

export const esquemaRevisarEntrega = z.object({
  operacion_id: uuid,
  pedido_id: uuid,
  nota: z.string().trim().min(5).max(300),
});

export const esquemaDevolver = z.object({
  operacion_id: uuid,
  pedido_id: uuid,
  motivo: z.string().trim().min(5).max(300),
});

export const esquemaCerrarRuta = z.object({
  operacion_id: uuid,
  ruta_id: uuid,
});

export const esquemaEvidenciaUrl = z.object({
  pedido_id: uuid,
  tipo: z.enum(["foto", "firma"]),
});

export const esquemaReordenar = z.object({
  operacion_id: uuid,
  ruta_id: uuid,
  orden: z.array(uuid).min(1).max(200),
  motivo: z.string().trim().min(5).max(300),
});

export function validar<T>(esquema: z.ZodType<T>, dato: unknown): T {
  const resultado = esquema.safeParse(dato);
  if (!resultado.success) throw new Error("SOLICITUD_INVALIDA");
  return resultado.data;
}
