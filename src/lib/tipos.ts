export type LineaDocumento = {
  cantidad: number;
  precio_unitario?: number;
  subtotal: number;
  producto: { nombre: string; sku?: string } | null;
};

export type EstadoPedido = {
  pedido: {
    id: string;
    folio: number;
    cliente_alias: string;
    total: number;
    estado: string;
    tipo_documento?: string | null;
    folio_documento?: string | null;
    orden_compra_ref?: string | null;
    zona?: string | null;
    parada?: number | null;
    ruta_id?: string | null;
  };
  lineas: LineaDocumento[];
  cobro: {
    id: string;
    estado: string;
    importe: number;
    vigencia_hasta: string;
    concepto: string;
    pagado_en?: string | null;
    comprobante_clave?: string | null;
  } | null;
  intento: { id: string; estado: string; expira_en: string; num_ref?: string; metodo?: string } | null;
  segundos: number;
  intentos_desde_apertura: number;
  quedan_intentos: number;
  pago?: {
    monto: number;
    pagador_banco?: string | null;
    pagador_clabe_ultimos4?: string | null;
    clave_rastreo?: string | null;
  } | null;
};

export type ParadaRuta = {
  id: string;
  folio: number;
  cliente_alias: string;
  zona: string | null;
  total: number;
  estado: string;
  parada: number;
  tipo_documento: string | null;
  folio_documento: string | null;
  orden_compra_ref: string | null;
  piezas: Array<{ nombre: string; cantidad: number }>;
  cobro: { id: string; estado: string; vigente: boolean; segundos: number; importe: number } | null;
};

export type RespuestaRuta = {
  ruta: { id: string; nombre: string; fecha?: string } | null;
  paradas: ParadaRuta[];
  resumen: { entregadas: number; cobrado: number; por_cobrar: number };
  siguiente_parada: string | null;
  dia?: string;
};

export type ReordenFila = {
  id: number;
  ocurrio_en: string;
  repartidor: string;
  detalle: { motivo?: string; antes?: string[]; despues?: string[]; ruta_id?: string };
};

export type PagoDiscrepancia = {
  id: string;
  monto: number;
  resultado: string;
  resolucion: string | null;
  nota_resolucion?: string | null;
  folio: number | null;
  pedido_id: string | null;
  repartidor: string | null;
  pagador_banco: string | null;
  pagador_clabe_ultimos4: string | null;
  clave_rastreo: string | null;
  pagado_en?: string | null;
  recibido_en?: string | null;
};

export type Tablero = {
  indicadores: {
    cobrado: number;
    pendiente: number;
    vencido: number;
    por_resolver: number;
    recuperados: number;
    devuelto: number;
  };
  repartidores: Array<{ repartidor_id: string; nombre: string }>;
  pedidos: Array<{
    id: string;
    folio: number;
    cliente_alias: string;
    total: number;
    estado: string;
    repartidor: string;
    cobro: { estado: string; importe: number } | null;
  }>;
  discrepancias: PagoDiscrepancia[];
  entregas_por_revisar: Array<{
    pedido_id: string;
    folio: number | null;
    cliente: string | null;
    repartidor: string | null;
    total: number | null;
    recibe_nombre: string;
    nota?: string | null;
    excepcion?: string | null;
  }>;
  rutas: Array<{
    id: string;
    nombre: string;
    estado: string;
    repartidor: string;
    repartidor_id?: string;
    paradas: Array<{
      id: string;
      parada: number;
      cliente: string;
      zona: string | null;
      estado: string;
      total: number;
      folio_documento: string | null;
      orden_compra: string | null;
    }>;
  }>;
  reordenamientos: ReordenFila[];
  generado_en?: string;
};
