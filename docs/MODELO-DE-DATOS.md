# Modelo de datos · Ruta y evidencia

## Tablas nuevas o ampliadas

| Objeto | Rol |
| --- | --- |
| `rutas` | Ruta del día por repartidor (`abierta` / `cerrada`) |
| `pedidos` | Además del cobro directo: `ruta_id`, `tipo_documento`, `folio_documento`, `parada`, `orden_compra_ref`, `zona`; estados `pendiente` y `devuelto` |
| `cobros.abierto_en` | Marca la última apertura; los 5 intentos se cuentan desde ahí |
| `entregas_evidencia` | Foto, firma, hashes, excepción, geolocalización, revisión |

## Funciones SQL (Fase 2)

`crear_ruta`, `cargar_documento` (con `p_orden_compra` y `p_zona`), `abrir_cobro`, `crear_intento` (INTENTO_VIGENTE), `marcar_entregado` (evidencia), `revisar_entrega`, `devolver_documento`, `cerrar_ruta`, `reordenar_paradas`, `expirar_vencidos` (ruta → pendiente), `verificar_integridad` (5 pruebas).

## Migraciones

1. `20261114200000_ruta_entrega.sql`
2. `20261114210000_reorden_paradas_orden_compra.sql`

**Aviso:** Polo no pegó en el chat los SQL originales. Estas versiones se armaron desde el prompt y el complemento; deben cotejarse con su SQL probado.
