# Bitácora de desarrollo

Una línea por hito. Hora de Ciudad de México.

| Fecha y hora | Qué se hizo | Qué se probó | Qué falta |
| --- | --- | --- | --- |
| 2026-11-14 11:47 | Repositorio público creado; base inicial con migraciones de Supabase, documentación y reglas de git | SQL probado en Postgres 16 con doce situaciones (pedido, intento, pago exacto, monto distinto, duplicado, sin cobro, pago tardío con aceptación, cancelación con devolución, entrega, falta de stock, límite de intentos, alteración de bitácora) | Crear el proyecto de Supabase y conectarlo al repositorio; correr datos de demostración; construir funciones, pantallas, pruebas y despliegue |
| 2026-11-14 13:06 | Andamiaje de Vite, React, Tailwind y configuración local de Supabase en `feature/construccion` (sale de `develop`, a petición de Polo, en lugar de una rama por pieza) | `npm install` y compilación del esqueleto | Funciones, pantallas, pruebas y documentación. Faltan en el entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `PEY_BANK_ACCOUNT_ID` y `SITE_URL`. No se pidieron ni se usaron |
