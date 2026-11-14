# Guion del demo (3 minutos)

Hablar claro, tratar de usted, y si usa el simulador **dígalo en voz alta**: es simulación, no un pago bancario.

Cuentas: `repartidor1@demo.invalid` y `admin@demo.invalid`. La contraseña la define quien instala el proyecto.

## Minuto 0:00 — La ruta (25 s)

«Administración ya cargó las remisiones del día. El repartidor no arma el pedido: cobra el monto del documento.»

1. Entre como repartidor, en el celular.
2. Muestre **Mi ruta**: entregadas, cobrado y por cobrar. La siguiente parada está resaltada.

## Minuto 0:25 — Cobro, vencimiento y otro QR (70 s)

1. Abra la remisión. El monto no se edita. Pulse **Cobrar**.
2. Muestre el QR grande sobre blanco, el folio, la cuenta regresiva de 6 minutos y «Intento N de 5».
3. Deje vencer el intento, o explique que a los 6 minutos pasa a vencido. Pulse **Generar nuevo QR**. Hay hasta cinco intentos.
4. Si no hay llaves de pey, diga: «Aquí iría el QR real; en esta corrida las variables de pey aún no están en el entorno.»

## Minuto 1:35 — El pago (40 s)

**Opción A — pago real de centavos:** el cliente paga desde su banco. En unos **3 segundos** (tiempo medido) el celular pasa a «Pagado» sin recargar.

**Opción B — simulador:** «Voy a simular el aviso de pey; no estoy moviendo dinero.» Corra `npm run simular-webhook` apuntando a `webhook-pey` con el `INTENTO_ID` y `NUM_REF` del cobro abierto.

Lea en voz alta: «El pago no prueba la entrega.»

## Minuto 2:15 — Entrega con evidencia (30 s)

1. Pulse **Marcar entrega**.
2. Tome la foto del paquete, pida la firma en el recuadro y escriba el nombre de quien recibe. El botón sigue bloqueado hasta tener las tres cosas.
3. Si no hay foto o no hay firma, elija la excepción y escriba una nota. Esa entrega queda para revisión de administración.

## Minuto 2:45 — Orden y tablero (35 s)

1. En la ruta, pulse **Cambiar orden de paradas**. Mueva una parada con las flechas, elija el motivo y pulse **Guardar orden y avisar**.
2. Lea: «Orden guardado. Se avisó a administración.»
3. Entre como administrador. En el tablero, muestre la tarjeta «cambió el orden de su ruta» y pulse **Marcar como visto**.
4. Si hay un pago por resolver, acepte uno y devuelva otro. Los dos piden nota. Se ve el banco y los últimos 4, nunca la CLABE completa.
5. En bitácora, pulse **Verificar integridad**. Cada revisión se ve como OK o FALLA.

## Cierre

«El dinero fue de la cuenta del cliente a la de la empresa. La entrega quedó con foto y firma. Esto es demostración con datos ficticios, sin validez fiscal. Lo verificado frente a pey está en `docs/PEY-VERIFICADO.md`.»
