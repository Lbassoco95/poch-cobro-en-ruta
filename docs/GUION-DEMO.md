# Guion del demo (3 minutos)

Hablar claro, tratar de usted, y si usa el simulador **dígalo en voz alta**: es simulación, no un pago bancario.

## Minuto 0:00 — El problema (20 s)

«Hoy el repartidor cobra en efectivo o pide una transferencia a su cuenta. El dinero tarda en cuadrar y el stock de la camioneta no baja al momento. Poch convierte su celular en la terminal de cobro de la empresa, con CoDi.»

## Minuto 0:20 — Pedido y QR (50 s)

1. Entra como `repartidor1@demo.invalid`.
2. «Nuevo pedido», alias del cliente, agrega una o dos piezas de centavos.
3. «Generar cobro». Muestre el QR grande, el monto y la cuenta regresiva.
4. Si no hay llaves de pey en el ambiente, diga: «Aquí iría el QR real; en esta corrida las variables de pey aún no están en el entorno.»

## Minuto 1:10 — El pago (50 s)

**Opción A — pago real de $0.01:** el cliente paga desde su banco. En unos **3 segundos** (tiempo medido) el celular pasa a «Pagado» sin recargar. Muestre banco, últimos 4 de la CLABE del pagador, monto y hora. Abra el enlace `/c/…` del comprobante del cliente: empresa, cuenta destino, folio, piezas, referencia y clave de rastreo; sin datos del pagador ni del repartidor.

**Opción B — simulador:** «Voy a simular el aviso de pey; no estoy moviendo dinero.» Corra `npm run simular-webhook` apuntando a `webhook-pey` con el `INTENTO_ID` y `NUM_REF` del cobro abierto. La pantalla debe pasar a Pagado.

## Minuto 2:00 — Entrega y tablero (40 s)

1. «Marcar entregado». El stock de la camioneta baja.
2. Entre como administrador. Muestre indicadores, el pedido pagado y «Verificar integridad» (cuatro pruebas en verde).
3. Si aplica: «Conciliar con pey» recupera lo que no llegó por webhook (`GET /transaction/codi/qr/{{id}}`).

## Minuto 2:40 — Cierre (20 s)

«El dinero fue de la cuenta del cliente a la de la empresa. La bitácora quedó encadenada. Esto es demostración con datos ficticios, sin validez fiscal. Lo verificado frente a pey está en `docs/PEY-VERIFICADO.md`, incluido el pago real de un centavo.»
