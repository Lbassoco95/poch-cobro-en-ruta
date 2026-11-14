const MENSAJES: Record<string, string> = {
  REPARTIDOR_INVALIDO: "El repartidor no está activo.",
  VIGENCIA_INVALIDA: "La vigencia debe estar entre 6 y 120 minutos.",
  PEDIDO_VACIO: "Agregue al menos una pieza.",
  CANTIDAD_INVALIDA: "La cantidad no es válida.",
  PRODUCTO_INVALIDO: "Hay una pieza que no está en el catálogo.",
  SIN_EXISTENCIA: "No hay piezas suficientes en la camioneta.",
  COBRO_NO_ENCONTRADO: "No encontramos el cobro.",
  COBRO_YA_PAGADO: "Este cobro ya está pagado.",
  COBRO_NO_VIGENTE: "El cobro ya no está vigente.",
  LIMITE_DE_INTENTOS: "Este cobro ya tuvo cinco intentos.",
  METODO_INVALIDO: "El método de cobro no es válido.",
  PEDIDO_NO_ENCONTRADO: "No encontramos el pedido.",
  PEDIDO_NO_PAGADO: "Solo se entrega un pedido pagado.",
  PEDIDO_NO_CANCELABLE: "Este pedido ya no se puede cancelar.",
  NOTA_OBLIGATORIA: "Escriba una nota de al menos 5 caracteres.",
  PAGO_NO_ENCONTRADO: "No encontramos el pago.",
  PAGO_SIN_DISCREPANCIA: "Este pago no necesita resolución.",
  ACCION_NO_PERMITIDA: "Esa acción no está permitida para este pago.",
  ACCION_INVALIDA: "La acción no es válida.",
};

export function traducir(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes("SIN_EXISTENCIA")) {
    const sku = texto.split("SIN_EXISTENCIA:")[1]?.trim();
    return sku ? `No hay piezas suficientes de ${sku}.` : MENSAJES.SIN_EXISTENCIA;
  }
  for (const [clave, mensaje] of Object.entries(MENSAJES)) {
    if (texto.includes(clave)) return mensaje;
  }
  return "No se pudo completar la acción. Intente de nuevo.";
}

export function responderError(error: unknown): { estado: number; error: string } {
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes("NO_AUTENTICADO")) return { estado: 401, error: "Debe iniciar sesión." };
  if (texto.includes("SIN_PERMISO")) return { estado: 403, error: "No tiene permiso para esta acción." };
  if (texto.includes("PEY_NO_CONFIGURADO")) {
    return { estado: 503, error: "El cobro con CoDi no está configurado en el servidor." };
  }
  if (texto.includes("FUNCION_NO_CONFIGURADA")) {
    return { estado: 503, error: "El servicio no está configurado." };
  }
  if (texto.includes("PEY_NO_DISPONIBLE")) {
    return { estado: 503, error: "El servicio de cobro no está disponible. Intente de nuevo." };
  }
  if (texto.includes("PEY_RECHAZO")) {
    return { estado: 502, error: "No se pudo generar el cobro. Intente de nuevo." };
  }
  if (texto.includes("SOLICITUD_INVALIDA")) return { estado: 400, error: "La solicitud no es válida." };
  const claro = traducir(error);
  if (claro === "No se pudo completar la acción. Intente de nuevo.") return { estado: 500, error: claro };
  return { estado: 400, error: claro };
}
