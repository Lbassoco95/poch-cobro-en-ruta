# Ruta y entrega · Poch

## Flujo

1. El administrador crea una **ruta** del día y carga **documentos** (remisión, nota de venta u orden de compra) con piezas, zona y referencia de orden de compra. Cada documento es una parada.
2. El repartidor ve **Mi ruta**: entregadas, cobrado y por cobrar; la lista se centra en la siguiente parada.
3. En la parada **Cobra** (abre o reabre el cobro) y muestra el QR (6 minutos). Si vence: «Generar otro QR · intento N de 5». A los 5, solo queda devolver el documento.
4. Con el pago aplicado, **Entrega**: foto de las piezas (no de personas), firma en pantalla y nombre de quien recibe. Opciones de excepción con nota; quedan para revisión.
5. El administrador revisa evidencia con URL firmada (60 s) y puede cerrar la ruta cuando no queden pendientes.

## Estados del documento

`pendiente` → `por_cobrar` → `pagado` → `entregado`  
También: `devuelto` (desde pendiente o por cobrar) y `cancelado` (solo venta directa sin ruta).

Si el cobro vence en un documento de ruta, vuelve a `pendiente` y se puede reabrir.

## Evidencia

Se guarda en el bucket privado `evidencias`: foto y firma, con huella sha256. La tabla `entregas_evidencia` no permite borrar ni alterar la evidencia; solo la revisión administrativa.

**La foto y la firma sirven como constancia de entrega. No son firma electrónica avanzada.**

## Reorden

El repartidor puede reordenar paradas pendientes o por cobrar con un motivo (≥ 5 caracteres). Queda en bitácora como `ruta_reordenada` (antes, después, motivo).
