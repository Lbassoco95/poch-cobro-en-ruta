# Poch · cobro en ruta con CoDi

**Poch** (por *Pochteca*, los comerciantes que recorrían rutas en Mesoamérica) convierte el celular de un repartidor en su terminal de cobro. El repartidor arma el pedido con piezas de su camioneta, el sistema genera un QR de CoDi, el cliente paga desde la app de su banco y el dinero va **directo de la cuenta del cliente a la cuenta de la empresa**. Cuando llega la confirmación, el stock de la camioneta baja y la empresa ve todo en tiempo real.

Proyecto del **Cursor Hackatón México (CDMX, 14 de noviembre de 2026)**, construido con la API de pey.

> **Demostración con datos ficticios. Sin validez fiscal.** Empresa, repartidores, clientes y catálogo son inventados. Los precios están en centavos porque las pruebas con pey son en producción y no se devuelven.

## Estado

En construcción. El avance, hora por hora, está en [`docs/BITACORA-DE-DESARROLLO.md`](docs/BITACORA-DE-DESARROLLO.md). Lo que está verificado frente a pey y lo que es suposición está en [`docs/PEY-VERIFICADO.md`](docs/PEY-VERIFICADO.md).

## Qué hay hoy en el repositorio

- `supabase/migrations/`: esquema y lógica de la base (Postgres), ya probados en Postgres 16.
- `supabase/sql/datos-demo.sql`: catálogo y stock de demostración. Se corre a mano, después de crear los usuarios.
- `docs/PROMPT-CONSTRUCCION.md`: el encargo completo de construcción.
- `docs/`: bitácora, tabla de datos de pey, cuaderno de datos y guion del demo.

## Equipo y método

Desarrollo de Yoltik con Git Flow simplificado: `main` solo con lo que funciona, `develop` para integrar y `feature/*` para cada pieza. Detalle en [`CLAUDE.md`](CLAUDE.md).
