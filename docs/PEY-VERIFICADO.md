# Datos de pey: verificado y supuesto

Fuente general: https://docs.pey.mx. Estados: **Doc.** = verificado en la documentación pública; **Pago real** = confirmado con un pago real; **Supuesto**; **Pregunta** = pendiente de preguntar a pey.

Última revisión de documentación: 14 de noviembre de 2026.

| Dato | Valor | Fuente | Estado |
| --- | --- | --- | --- |
| Base de la API y autenticación | `https://api.pey.mx`, Bearer con la API key | docs.pey.mx/docs/api/codi-api | Doc. |
| Sandbox | No existe; se prueba en producción con $0.01 | docs.pey.mx/docs/tutorials/getting-started/create-an-api-key | Doc. |
| QR: monto | `amount` ≥ 0; 0 deja que el pagador escriba el monto (no se usa) | docs.pey.mx/openapi.json | Doc. |
| QR: vigencia | 0 o ≥ 360 s; se usa 360 | docs.pey.mx/openapi.json | Doc. |
| `numRef` | 1 a 7 dígitos (`^[0-9]{1,7}$`), por defecto "0" | docs.pey.mx/openapi.json | Doc. |
| `metadata` | hasta 50 pares; claves ≤ 40; valores ≤ 500; solo escalares; vuelven como texto | docs.pey.mx/openapi.json | Doc. |
| Aviso al celular: monto y vigencia | > 0 y ≤ 1,000,000; vigencia ≥ 360 s | docs.pey.mx/openapi.json | Doc. |
| Payload del webhook de QR | `amount`, `apiKeyId`, `bankAccountId`, `codiQrId`, `concept`, `datePaid` (Unix, segundos), `metadata`, `numRef`, `transactionId`, `type` | docs.pey.mx/docs/webhooks/codi/qr | Doc. |
| Payload del webhook de aviso | igual, sin `codiQrId`; tipo `codi.pn.payment_received` | docs.pey.mx/docs/webhooks/codi/pn | Doc. |
| Datos del pagador en `metadata` | `clabe`, `bankCode`, `accountType`, `trackingKey` | docs.pey.mx/docs/types/metadata-response | Doc. |
| Datos enviados al crear el cobro | vuelven en `metadata.externalMetadata` | docs.pey.mx/docs/types/metadata-response | Doc. |
| Firma del webhook | Standard Webhooks sobre el cuerpo crudo; `webhook-id` para deduplicar | docs.pey.mx/docs/webhooks/introduction | Doc. |
| Cuentas bancarias | alta con `POST /bank-account`; hasta 5 días hábiles ante Banxico; la cuenta de prueba se activa de inmediato | docs.pey.mx/docs/tutorials/getting-started/create-an-api-key | Doc. |
| Conciliación | `GET /transaction/api-key` (80 por página); `GET /transaction/codi/qr/{id}` (20 por página) | docs.pey.mx/openapi.json | Doc. |
| Reintentos del webhook | No documentados | docs.pey.mx/docs/webhooks/introduction | Pregunta |
| Devoluciones por API | No documentadas | docs.pey.mx | Pregunta |
| Vigencia máxima del QR; pago doble de un QR dinámico | No documentados | docs.pey.mx | Pregunta |
| `numRef` en el aviso: ¿el enviado o uno asignado por Banxico? | La documentación dice "asignado por Banxico" | docs.pey.mx/docs/webhooks/codi/qr | Pregunta |
| Costo | "Por el momento, la API no tiene costo" | docs.pey.mx | Doc. (temporal) |
| Contenido real del primer webhook | Pendiente de capturar | Primer pago real de $0.01 | Pago real (pendiente) |
