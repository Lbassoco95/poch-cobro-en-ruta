# Datos de pey: verificado y supuesto

Fuente general: https://docs.pey.mx. Estados: **Doc.** = verificado en la documentación pública; **Pago real** = confirmado con un pago real; **Supuesto**; **Pregunta** = pendiente de preguntar a pey.

Última revisión de documentación: 14 de noviembre de 2026.
Pago real de verificación: **$0.01 el 14 de noviembre de 2026**.

| Dato | Valor | Fuente | Estado |
| --- | --- | --- | --- |
| Base de la API y autenticación | `https://api.pey.mx`, Bearer con la API key | docs.pey.mx/docs/api/codi-api | Doc. |
| Sandbox | No existe; se prueba en producción con $0.01 | docs.pey.mx/docs/tutorials/getting-started/create-an-api-key | Doc. |
| QR: monto | `amount` ≥ 0; 0 deja que el pagador escriba el monto (no se usa) | docs.pey.mx/openapi.json | Doc. |
| QR: vigencia | 0 o ≥ 360 s; se usa 360 | docs.pey.mx/openapi.json | Doc. |
| `numRef` | 1 a 7 dígitos (`^[0-9]{1,7}$`), por defecto "0" | docs.pey.mx/openapi.json | Doc. |
| `numRef` en el recibo del pagador | La referencia numérica del recibo bancario fue la que enviamos | Pago real $0.01, 14-nov-2026 | **Pago real** |
| `metadata` | hasta 50 pares; claves ≤ 40; valores ≤ 500; solo escalares; vuelven como texto en `externalMetadata` | docs.pey.mx/openapi.json | Doc. |
| `intento_id` en metadata | Regresa en `externalMetadata` y sirve como segunda llave | Pago real $0.01, 14-nov-2026 | **Pago real** |
| Aviso al celular: monto y vigencia | > 0 y ≤ 1,000,000; vigencia ≥ 360 s | docs.pey.mx/openapi.json | Doc. |
| Respuesta de `POST /codi/qr` | Solo `id` (del QR), `qrString`, `qrImage`. **Sin `transactionId`** | Pago real $0.01, 14-nov-2026 | **Pago real** |
| `bankAccountId` al crear QR/aviso | Si la llave ya está ligada a una cuenta, **no enviarlo**. Un valor que no corresponde da `BANK_ACCOUNT_NOT_FOUND` | Pago real / uso de la llave, 14-nov-2026 | **Pago real** |
| Payload del webhook de QR | `amount`, `apiKeyId`, `bankAccountId`, `codiQrId`, `concept`, `datePaid` (Unix, segundos), `metadata`, `numRef`, `transactionId`, `type` | docs.pey.mx/docs/webhooks/codi/qr + pago real | Doc. + **Pago real** |
| Ligar pago al intento | Por `codiQrId` (id del QR) y por `numRef`; refuerzo con `externalMetadata.intento_id` | Pago real $0.01, 14-nov-2026 | **Pago real** |
| Payload del webhook de aviso | igual, sin `codiQrId`; tipo `codi.pn.payment_received` | docs.pey.mx/docs/webhooks/codi/pn | Doc. |
| Datos del pagador en `metadata` | `clabe`, `bankCode`, `accountType`, `trackingKey`. El nombre del pagador **no llega** | docs + pago real | Doc. + **Pago real** |
| Qué se guarda del pagador | Banco, tipo de cuenta, últimos 4 de la CLABE, clave de rastreo. Nunca la CLABE completa | Regla del producto + pago real | **Pago real** |
| Firma del webhook | Standard Webhooks sobre el cuerpo crudo; `webhook-id` para deduplicar | docs.pey.mx/docs/webhooks/introduction | Doc. |
| Cuentas bancarias | alta con `POST /bank-account`; hasta 5 días hábiles ante Banxico; la cuenta de prueba se activa de inmediato | docs.pey.mx/docs/tutorials/getting-started/create-an-api-key | Doc. |
| Conciliación por QR | `GET /transaction/codi/qr/{qrId}` → `{ items, nextToken }`. Ítem: `amount`, `amountBreakdown.base`, `currency`, `dateCreated`, `datePaid` (segundos; coinciden porque la tx se crea al pagar), `description` (nombre de la cuenta que cobra; no es el concepto), `id` (transacción), `metadata`, `paymentMethod`, `status`. **Sin `numRef`**. `items` vacío = aún no pagado. `metadata` igual que el webhook | Pago real $0.01, 14-nov-2026 | **Pago real** |
| Tiempo pago → confirmación en pey | **3 segundos** (medido) | Pago real $0.01, 14-nov-2026 | **Pago real** |
| Reintentos del webhook | No documentados | docs.pey.mx/docs/webhooks/introduction | Pregunta |
| Devoluciones por API | No documentadas | docs.pey.mx | Pregunta |
| Vigencia máxima del QR; pago doble de un QR dinámico | No documentados | docs.pey.mx | Pregunta |
| Costo | "Por el momento, la API no tiene costo" | docs.pey.mx | Doc. (temporal) |
