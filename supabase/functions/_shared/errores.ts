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
  COBRO_NO_REABRIBLE: "Este cobro no se puede volver a abrir.",
  LIMITE_DE_INTENTOS: "Este cobro ya tuvo cinco intentos.",
  INTENTO_VIGENTE: "Ya hay un QR vigente para este cobro. Espere a que venza para generar otro.",
  METODO_INVALIDO: "El método de cobro no es válido.",
  PEDIDO_NO_ENCONTRADO: "No encontramos el pedido.",
  PEDIDO_NO_PAGADO: "Solo se entrega un pedido pagado.",
  PEDIDO_NO_CANCELABLE: "Este pedido ya no se puede cancelar.",
  NOTA_OBLIGATORIA: "Escriba una nota de al menos 5 caracteres.",
  PAGO_NO_ENCONTRADO: "No encontramos el pago.",
  PAGO_SIN_DISCREPANCIA: "Este pago no necesita resolución.",
  ACCION_NO_PERMITIDA: "Esa acción no está permitida para este pago.",
  ACCION_INVALIDA: "La acción no es válida.",
  RUTA_NO_ENCONTRADA: "No encontramos la ruta.",
  RUTA_CERRADA: "La ruta ya está cerrada.",
  RUTA_AJENA: "Esa ruta no le corresponde.",
  RUTA_CON_PENDIENTES: "Aún hay paradas sin terminar.",
  TIPO_INVALIDO: "El tipo de documento no es válido.",
  FOLIO_INVALIDO: "El folio del documento no es válido.",
  CLIENTE_INVALIDO: "Escriba el nombre del cliente.",
  DOCUMENTO_DUPLICADO: "Ese documento ya está en la ruta.",
  DOCUMENTO_VACIO: "Agregue al menos una pieza.",
  DOCUMENTO_NO_ENCONTRADO: "No encontramos el documento.",
  DOCUMENTO_NO_PENDIENTE: "Este documento no está listo para cobrar.",
  DOCUMENTO_NO_DEVOLVIBLE: "Este documento ya no se puede devolver.",
  EVIDENCIA_INCOMPLETA: "Falta evidencia de la entrega.",
  EXCEPCION_INVALIDA: "La excepción de entrega no es válida.",
  ENTREGA_NO_ENCONTRADA: "No encontramos la evidencia de entrega.",
  USAR_DEVOLUCION: "En ruta use «Devolver documento».",
  NOMBRE_INVALIDO: "Escriba un nombre para la ruta.",
  FECHA_INVALIDA: "La fecha de la ruta no es válida.",
  ORDEN_INVALIDA: "El orden de las paradas no es válido.",
  ORDEN_INVALIDO: "El orden de las paradas no es válido.",
  MOTIVO_OBLIGATORIO: "Escriba un motivo de al menos 5 caracteres.",
  SIN_PARADAS_MOVIBLES: "No hay paradas que se puedan reordenar.",
  SIN_CAMBIOS: "El orden es el mismo; no hay nada que cambiar.",
  RUTA_YA_CERRADA: "La ruta ya estaba cerrada.",
  ORDEN_COMPRA_INVALIDA: "La orden de compra no puede pasar de 40 caracteres.",
  ENTREGA_SIN_REVISION_PENDIENTE: "Esta entrega no tiene una revisión pendiente.",
  EVIDENCIA_NO_ENCONTRADA: "No encontramos el archivo de evidencia.",
  EVIDENCIA_INVALIDA: "El archivo de evidencia no es válido.",
};

export function traducir(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  const vigente = texto.match(/INTENTO_VIGENTE:(\d+)/);
  if (vigente) {
    const segundos = Number(vigente[1]);
    return `Ya hay un QR activo; espera a que venza para generar otro (${segundos} s).`;
  }
  if (texto.includes("INTENTO_VIGENTE")) {
    return "Ya hay un QR activo; espera a que venza para generar otro.";
  }
  if (texto.includes("SIN_EXISTENCIA")) {
    const sku = texto.split("SIN_EXISTENCIA:")[1]?.trim();
    return sku ? `No hay piezas suficientes de ${sku}.` : MENSAJES.SIN_EXISTENCIA;
  }
  for (const [clave, mensaje] of Object.entries(MENSAJES)) {
    if (texto.includes(clave)) return mensaje;
  }
  return "No se pudo completar la acción. Intente de nuevo.";
}

export function responderError(error: unknown): { estado: number; error: string; segundos_restantes?: number } {
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
  const vigente = texto.match(/INTENTO_VIGENTE:(\d+)/);
  if (vigente) {
    return {
      estado: 409,
      error: traducir(error),
      segundos_restantes: Number(vigente[1]),
    };
  }
  const claro = traducir(error);
  if (claro === "No se pudo completar la acción. Intente de nuevo.") return { estado: 500, error: claro };
  return { estado: 400, error: claro };
}
