# PROMPT v2.1 — Cursor — Poch: cobro en ruta con CoDi para repartidores (Cursor Hackatón México, corrida única)

Fecha: 14 de noviembre de 2026. Reemplaza a la v2 del mismo día (solo cambia el nombre del producto a Poch) y al prompt del 13 de noviembre (caso de impuestos estatales, que pasa a otro proyecto con otro nombre). Pégalo completo en el agente de Cursor y construye todo en una sola corrida. Todas las decisiones están aquí. No hagas pausas ni preguntas: si algo no está definido, elige la opción más sencilla que cumpla los requisitos y anótalo en el informe final. La única parada permitida es la de la sección 10.1 (si el repositorio no existe).

---

## 1. Quién eres y qué construyes

Eres un ingeniero de software sénior. Construyes, de principio a fin, una aplicación web funcional de nombre **Poch** (por Pochteca, los comerciantes que recorrían rutas en Mesoamérica; nombre de trabajo, sin revisión de marca todavía; el repositorio se llama `poch-cobro-en-ruta`) para el **Cursor Hackatón México (CDMX, 14 de noviembre de 2026)**, organizado con pey. Entrega: domingo 15 de noviembre, 1:00 p. m. hora CDMX, con repositorio público y, de preferencia, aplicación en vivo.

Polo trabaja solo y no escribe código. Define qué debe lograr el sistema y bajo qué criterio; tú decides cómo implementarlo. Entrega el proyecto terminado, probado, desplegable y con el repositorio en orden.

## 2. El problema

Una empresa que vende refacciones en ruta cobra hoy con efectivo o transferencias que llegan sin referencia. El repartidor no sabe si el pago llegó, el almacén no sabe cuánto stock queda en cada camioneta y finanzas concilia a mano al día siguiente.

Poch convierte el celular del repartidor en su terminal de cobro. El repartidor arma el pedido con piezas de su propia camioneta, el sistema genera un cobro con QR de CoDi, el cliente paga desde la app de su banco, y el dinero va **directo de la cuenta del cliente a la cuenta de la empresa**. El repartidor no maneja efectivo ni custodia fondos. Cuando pey avisa el pago, el sistema lo concilia, el repartidor lo ve al instante, entrega y el stock de su camioneta baja. La empresa ve en tiempo real qué se cobró, qué falta y qué stock queda en cada ruta.

Idea de la hoja de pey que cubre: «Cobro al entregar» (5), con «Pedidos» (2) y «Facturas que se concilian solas» (19).

## 3. Reglas de alcance

1. **Todo es demostración con datos ficticios.** Empresa, repartidores, clientes y catálogo son inventados. Aviso permanente en el pie de cada pantalla y comprobante: «Demostración con datos ficticios. Sin validez fiscal».
2. **Repositorio público.** No incluyas llaves, secretos, tokens, CLABE, teléfonos ni datos reales, ni código de otros proyectos. Todo lo sensible va en variables de entorno y `.env.example` solo lleva marcadores.
3. **Sin archivo de licencia.** Polo decide ese punto después.
4. **Dinero real mínimo.** Los precios del catálogo de demostración están en centavos (de $0.01 a $0.05 por pieza) porque las pruebas con pey son en producción y los pagos de prueba no se devuelven. Anótalo en el README.
5. **Fuera de alcance de esta corrida (anótalo en el README como siguiente fase, sin construirlo):** disputas con evidencia de ambas partes, reporte de cobro erróneo, devoluciones por API, pago con tarjeta o liga de pago, carga de stock desde la interfaz, facturación fiscal, conexión con otros sistemas, notificaciones por correo, aplicación nativa.

## 4. Decisiones ya tomadas

### 4.1 Tecnología

- Frontend: React con Vite y TypeScript, Tailwind. **Primero celular** para el repartidor; el tablero del administrador es adaptable. Interfaz en español de México, tratando de usted, con botones grandes y texto legible a pleno sol. Tipografía Sora, paleta azul marino y verde jade, ámbar solo para advertencias.
- Backend y base: **Supabase** (Postgres, Auth y Edge Functions en Deno), en un proyecto **nuevo y separado** de cualquier otro (nombre `tequitl-hackaton`).
- Despliegue del frontend en Vercel; las funciones con la CLI de Supabase.
- **Compuerta.** El navegador nunca lee ni escribe tablas. Todo pasa por Edge Functions. Las tablas tienen RLS activo sin políticas y los permisos a `anon` y `authenticated` están revocados. Solo el rol de servicio, dentro de las funciones, toca los datos y ejecuta la lógica. El único uso de `supabase-js` en el navegador es el inicio de sesión.
- Dos roles con Supabase Auth: `admin` y `repartidor`, definidos en la tabla `perfiles`. Cada función protegida valida el JWT, busca el perfil activo y comprueba el rol. Un repartidor solo ve y opera **sus** pedidos y **su** stock.
- Un solo ambiente (demostración). Anótalo en el README: un producto real tendría desarrollo, QA y producción separados.

### 4.2 API de pey (lo verificado en la documentación pública el 14 de noviembre)

Aun así, antes de escribir código lee `https://docs.pey.mx/openapi.json` y las páginas de webhooks y confirma que nada cambió. Si algo difiere, sigue la documentación y anótalo.

- Base `https://api.pey.mx`, `Authorization: Bearer <PEY_API_KEY>`. No hay sandbox: las pruebas son reales con montos pequeños.
- `POST /codi/qr`: `amount` (≥ 0; **0 deja que el pagador escriba el monto: nunca lo uses**, el monto siempre es mayor que cero), `concept`, `expiration` (0 o ≥ 360 s; usa **360**), `numRef` (solo dígitos, de 1 a 7: `^[0-9]{1,7}$`), `generateImage` (usa `true`), `metadata` (hasta 50 pares, claves de hasta 40 caracteres, valores de hasta 500, solo escalares; vuelven como texto). **No envíes `bankAccountId` si la llave de pey ya está ligada a una cuenta** (mandarlo con un valor que no corresponde da `BANK_ACCOUNT_NOT_FOUND`; `PEY_BANK_ACCOUNT_ID` es opcional). Responde solo `id` (del QR), `qrString` y `qrImage` (PNG en base64). **No trae `transactionId`**: el id del QR se guarda en el intento; el `transactionId` se registra cuando llega el pago. Verificado con pago real de $0.01 el 14-nov-2026.
- `POST /codi/pn` (aviso al celular): `amount` (> 0 y ≤ 1,000,000), `phoneNumber` (10 dígitos), `concept`, `expiration` (mínimo 360, usa 360), `numRef`, `metadata`. Misma regla de `bankAccountId` opcional. Guarda el id del aviso CoDi en el intento; el `transactionId` llega con el pago.
- Consultas: `GET /transaction/{id}` (estado `PENDING` o `PAID`); `GET /transaction/codi/qr/{qrId}` → `{ items, nextToken }` (verificado con pago real: cada item trae `amount`, `amountBreakdown.base`, `currency`, `dateCreated`, `datePaid` en segundos Unix — coinciden porque la transacción se crea al pagar —, `description` = nombre de la cuenta que cobra y **no sirve como concepto**, `id` de la transacción, `metadata`, `paymentMethod`, `status`; **no trae `numRef`**; lista `items` vacía = aún no se pagó; `metadata` igual que el webhook: `accountType`, `bankCode`, `clabe`, `description`, `externalMetadata`, `trackingKey`). Tiempo medido entre el pago y su confirmación en pey: **3 segundos**.
- Errores 400 documentados: `INVALID_REQUEST`, `INVALID_AMOUNT`, `INVALID_PARAMETER`, `INCOMPLETE_PARAMETERS`, `INVALID_STATE`, `PEY_CONSISTENCY_ERROR`, entre otros; 503 `SERVICE_UNAVAILABLE`. Trátalos sin mostrar el texto interno al usuario.
- **Webhooks** firmados con Standard Webhooks: verifica sobre el **cuerpo crudo** (texto) con la biblioteca oficial; `webhook-id` es la llave de idempotencia; un webhook por API key; el secreto se muestra una sola vez; el portal tiene «Webhook Logs». Los reintentos **no están documentados**.
- Payload documentado de `codi.qr.payment_received` y `codi.pn.payment_received`: `amount` (pesos), `apiKeyId`, `bankAccountId`, `codiQrId` (solo QR), `concept`, `datePaid` (Unix en **segundos**), `numRef`, `transactionId` (ULID), `type` y `metadata` con `clabe`, `bankCode`, `accountType`, `trackingKey` (datos del **pagador**) y `externalMetadata` (lo que enviaste al crear el cobro, como texto).
- Se desconoce: política de reintentos, devoluciones por API, vigencia máxima y si un QR dinámico puede pagarse dos veces. **`numRef` sí viaja al banco del pagador**: con el pago real de $0.01 la referencia del recibo fue la que enviamos (verificado 14-nov-2026). Aun así, la identificación del pago no depende solo de `numRef` (sección 4.3).

### 4.3 Cómo se liga un pago con su cobro

Al crear un QR o un aviso, envía en `metadata` los pares `intento_id` y `cobro_id` y en `numRef` el `num_ref` numérico de la base. Al recibir el aviso, liga el pago con el intento por el **id del QR** (`codiQrId` en el webhook; es el `id` que devolvió `POST /codi/qr`) y por **`numRef`**. Como segunda llave, el `intento_id` enviado en `metadata` regresa en `externalMetadata`. Registra en la bitácora por cuál vía se encontró. Guarda el payload en `eventos_pey` **sin la CLABE completa** (solo últimos 4 dígitos).

### 4.4 Procesamiento del webhook

1. Lee el cuerpo crudo. Verifica la firma. Si es inválida: inserta en `eventos_pey` con `firma_valida = false`, registra en bitácora, **no cambia ningún cobro** y responde error.
2. Si es válida: inserta en `eventos_pey` con el `webhook-id` (único). Si ya existía, responde éxito sin repetir efectos.
3. Extrae los datos con una única función `extraerDatosPago(payload)` basada en los campos documentados (sección 4.2). Si un campo falta, el evento queda con resultado `sin_cobro` o `incompleto` y se registra; nunca se descarta en silencio.
4. Si el payload trae `transactionId`, **confirma con `GET /transaction/{id}`** que el estado sea `PAID` y que el monto coincida antes de conciliar.
5. Llama a la función SQL `conciliar_pago` (fuente `webhook`). **No reimplementes las reglas de conciliación en TypeScript**: viven en la base, en una sola transacción con su registro en bitácora.
6. Datos del pagador: guarda **banco** (clave de banco), **tipo de cuenta**, **últimos 4 dígitos** de la CLABE y **clave de rastreo**. Nunca la CLABE completa. El nombre del pagador **no llega**. Muéstralos según el rol: el administrador ve todo; el repartidor ve banco, últimos 4, monto y hora.
7. Marca el evento como procesado con su resultado y responde rápido.
8. Comprobante para el cliente: pantalla pública con enlace de clave aleatoria larga, sin sesión. Muestra empresa que cobró, últimos 4 de la cuenta destino, folio, piezas, monto, fecha y hora, número de referencia y clave de rastreo. Sin datos del pagador ni del repartidor. Debe decir que es informativo y no es comprobante fiscal.

### 4.5 Estados y reglas

Los estados y las reglas de conciliación ya están implementados en el SQL de la sección 5. Resumen para que construyas la interfaz:

- Cobro: `emitido`, `en_proceso`, `pagado`, `vencido`, `cancelado`. Pedido: `por_cobrar`, `pagado`, `entregado`, `cancelado`. Intento: `creado`, `pagado`, `expirado`, `error`.
- Un pago se **aplica** solo si el cobro no está pagado, vencido ni cancelado, el monto es **igual** al importe y llegó dentro de la vigencia del intento (más 30 segundos de tolerancia).
- Si no, se guarda en `pagos_confirmados` con su motivo: `monto_distinto`, `fuera_de_vigencia`, `duplicado`, `cobro_cancelado` o `sin_cobro`. El administrador lo resuelve: **aceptar** (solo si fue fuera de vigencia, con monto igual y stock disponible), **devolver** (queda pendiente) y **devuelto** (cuando lo devolvió desde su banco). Siempre con nota. Pey no documenta devoluciones por API: la devolución es manual y el sistema solo la registra.
- El stock se **aparta** al crear el pedido, se **libera** si el cobro vence o se cancela y **sale de verdad** solo cuando el repartidor marca la entrega con el pedido pagado. Un pago no prueba la entrega.

### 4.6 Identificador de operación

Cada orden del navegador (crear pedido, crear intento de pago, marcar entregado, cancelar, resolver pago) lleva un `operacion_id` (UUID v4) que genera el cliente. Si se repite por un doble toque o por mala señal, la base devuelve el mismo resultado y no duplica nada. Genera el identificador al abrir cada pantalla de acción y reutilízalo en los reintentos de esa misma acción.

### 4.7 Conciliación periódica contra pey

Función `conciliar-con-pey` (solo administrador): para cada intento QR con `pey_id` de las últimas 24 horas consulta `GET /transaction/codi/qr/{qrId}` (páginas con `nextToken`). Toma los ítems `PAID` y llama a `conciliar_pago` con fuente `conciliacion`, pasando el id del QR y el `num_ref` del intento (la lista de pey no trae `numRef`). Lista vacía = aún no pagado. Lo ya procesado por webhook devuelve `ya_procesado` y es normal. Lo recuperado aquí se muestra en el tablero. El tablero la dispara cada 60 segundos mientras está abierto y tiene un botón manual.

### 4.8 Bitácora, integridad y privacidad

- La bitácora solo admite agregar y cada fila lleva la huella de la anterior (cadena de huellas). La función `verificar_integridad()` comprueba la cadena y que los cobros pagados, el stock y los pedidos coincidan. El tablero tiene un botón «Verificar integridad» que muestra las cuatro pruebas con su resultado. Anota en el README que la cadena **detecta** alteraciones pero no las impide a quien administra la base.
- Aunque los datos son ficticios, construye como si fueran reales: sin teléfonos guardados (el del aviso se usa en la llamada a pey y se descarta), clientes solo con alias, CLABE del pagador solo con últimos cuatro dígitos. Agrega un aviso de privacidad corto en el README conforme a la LFPDPPP.

## 5. Base de datos (SQL listo para correr)

Polo lo corre en el editor SQL de Supabase **en este orden** y te devuelve el resultado: Bloque 1, Bloque 2, crear los tres usuarios en Authentication, Bloque 3. Este SQL ya se probó en Postgres 16 con doce situaciones (pedido, intento, pago exacto, monto distinto, duplicado, sin cobro, fuera de vigencia con aceptación, cancelación con devolución, entrega, falta de stock, límite de intentos y alteración de la bitácora). Incluye los tres bloques tal cual en `supabase/sql/` **y** pegados en el README, sección de instalación. No los cambies; si algo falla al ejecutarlo, repórtalo en el informe final con el SQL completo ya corregido, pegado en el informe.

### Bloque 1 — esquema

```sql
-- BLOQUE 1 · ESQUEMA (tablas, bitácora con cadena de huellas, permisos)
create extension if not exists pgcrypto with schema extensions;

create table public.perfiles (
  user_id uuid primary key references auth.users(id),
  rol text not null check (rol in ('admin','repartidor')),
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nombre text not null,
  precio numeric(12,2) not null check (precio > 0),
  activo boolean not null default true
);

create table public.movimientos_stock (
  id bigint generated always as identity primary key,
  repartidor_id uuid not null references public.perfiles(user_id),
  producto_id uuid not null references public.productos(id),
  tipo text not null check (tipo in ('carga','apartado','liberacion','salida','ajuste')),
  cantidad int not null check (cantidad <> 0 and (tipo = 'ajuste' or cantidad > 0)),
  pedido_id uuid,
  actor text not null,
  ocurrio_en timestamptz not null default now()
);

create table public.operaciones (
  operacion_id uuid primary key,
  tipo text not null,
  actor text not null,
  resultado jsonb,
  creado_en timestamptz not null default now()
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  repartidor_id uuid not null references public.perfiles(user_id),
  cliente_alias text not null check (char_length(cliente_alias) between 1 and 60),
  total numeric(12,2) not null check (total > 0),
  estado text not null default 'por_cobrar'
    check (estado in ('por_cobrar','pagado','entregado','cancelado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  producto_id uuid not null references public.productos(id),
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),
  subtotal numeric(12,2) not null check (subtotal > 0)
);

create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id),
  importe numeric(12,2) not null check (importe > 0),
  concepto text not null,
  vigencia_hasta timestamptz not null,
  estado text not null default 'emitido'
    check (estado in ('emitido','en_proceso','pagado','vencido','cancelado')),
  pagado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create sequence public.numref_seq minvalue 1 maxvalue 9999999 cycle;

create table public.intentos_pago (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros(id),
  metodo text not null check (metodo in ('qr','push')),
  num_ref text not null unique check (num_ref ~ '^[0-9]{1,7}$'),
  pey_id text,
  pey_codi_id text,
  pey_transaction_id text,
  monto numeric(12,2) not null,
  estado text not null default 'creado'
    check (estado in ('creado','pagado','expirado','error')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  pagado_en timestamptz
);

create table public.eventos_pey (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null unique,
  tipo text,
  firma_valida boolean not null,
  payload jsonb not null,
  recibido_en timestamptz not null default now(),
  procesado boolean not null default false,
  resultado text
);

create table public.pagos_confirmados (
  id uuid primary key default gen_random_uuid(),
  pey_transaction_id text not null unique,
  fuente text not null check (fuente in ('webhook','conciliacion')),
  intento_id uuid references public.intentos_pago(id),
  cobro_id uuid references public.cobros(id),
  monto numeric(12,2) not null,
  pagado_en timestamptz not null,
  resultado text not null check (resultado in
    ('aplicado','monto_distinto','fuera_de_vigencia','duplicado','sin_cobro','cobro_cancelado')),
  pagador_banco text,
  pagador_clabe_ultimos4 text,
  clave_rastreo text,
  resolucion text check (resolucion in ('aceptado','devolucion_pendiente','devuelto')),
  nota_resolucion text,
  resuelto_por text,
  resuelto_en timestamptz,
  recibido_en timestamptz not null default now()
);

create unique index un_pago_aplicado_por_cobro on public.pagos_confirmados (cobro_id)
  where resultado = 'aplicado' or resolucion = 'aceptado';

create table public.bitacora (
  id bigint generated always as identity primary key,
  ocurrio_en timestamptz not null default now(),
  actor text not null,
  accion text not null,
  pedido_id uuid,
  cobro_id uuid,
  operacion_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  hash_previo text,
  hash text not null default ''
);

create index on public.movimientos_stock (repartidor_id, producto_id);
create index on public.pedidos (repartidor_id, estado);
create index on public.intentos_pago (cobro_id);
create index on public.bitacora (cobro_id);
create index on public.bitacora (pedido_id);

-- Bitácora: solo agregar, con cadena de huellas (cada fila incluye la huella de la anterior)
create or replace function public.bitacora_encadenar()
returns trigger language plpgsql
set search_path = public, extensions as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(7001);
  select b.hash into v_prev from public.bitacora b order by b.id desc limit 1;
  new.hash_previo := v_prev;
  new.hash := encode(digest(
    coalesce(v_prev,'') || '|' || new.id::text || '|' ||
    to_char(new.ocurrio_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
    new.actor || '|' || new.accion || '|' ||
    coalesce(new.pedido_id::text,'') || '|' || coalesce(new.cobro_id::text,'') || '|' ||
    coalesce(new.operacion_id::text,'') || '|' || new.detalle::text, 'sha256'), 'hex');
  return new;
end $$;

create trigger bitacora_encadena before insert on public.bitacora
for each row execute function public.bitacora_encadenar();

create or replace function public.solo_agregar()
returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % solo admite agregar filas', tg_table_name;
end $$;

create trigger bitacora_no_modificar before update or delete on public.bitacora
for each row execute function public.solo_agregar();
create trigger bitacora_no_vaciar before truncate on public.bitacora
for each statement execute function public.solo_agregar();
create trigger stock_no_modificar before update or delete on public.movimientos_stock
for each row execute function public.solo_agregar();
create trigger stock_no_vaciar before truncate on public.movimientos_stock
for each statement execute function public.solo_agregar();

-- Stock derivado: se reconstruye siempre desde los movimientos
create or replace view public.v_stock_repartidor as
select m.repartidor_id, m.producto_id,
  sum(case m.tipo when 'carga' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad else 0 end)::int as existencia,
  sum(case m.tipo when 'apartado' then m.cantidad when 'liberacion' then -m.cantidad
                  when 'salida' then -m.cantidad else 0 end)::int as apartado
from public.movimientos_stock m
group by m.repartidor_id, m.producto_id;

-- Compuerta: RLS activo, sin políticas; el navegador no toca nada
alter table public.perfiles enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.operaciones enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_lineas enable row level security;
alter table public.cobros enable row level security;
alter table public.intentos_pago enable row level security;
alter table public.eventos_pey enable row level security;
alter table public.pagos_confirmados enable row level security;
alter table public.bitacora enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
```

### Bloque 2 — lógica

```sql
-- BLOQUE 2 · LÓGICA (cada función es una sola transacción: estado + bitácora juntos)

create or replace function public.reg_bitacora(
  p_actor text, p_accion text, p_pedido uuid, p_cobro uuid, p_operacion uuid, p_detalle jsonb)
returns void language sql as $$
  insert into public.bitacora (actor, accion, pedido_id, cobro_id, operacion_id, detalle)
  values (p_actor, p_accion, p_pedido, p_cobro, p_operacion, coalesce(p_detalle,'{}'::jsonb));
$$;

-- Inicia una operación con identificador propio. Devuelve el resultado guardado si ya existía.
create or replace function public.iniciar_operacion(p_op uuid, p_tipo text, p_actor text)
returns jsonb language plpgsql as $$
declare v_n int; v_res jsonb;
begin
  insert into public.operaciones (operacion_id, tipo, actor) values (p_op, p_tipo, p_actor)
  on conflict (operacion_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select resultado into v_res from public.operaciones where operacion_id = p_op;
    return coalesce(v_res, jsonb_build_object('repetida', true));
  end if;
  return null;
end $$;

-- Libera el stock apartado de un pedido
create or replace function public.liberar_pedido(p_pedido uuid, p_actor text)
returns void language plpgsql as $$
declare v_rep uuid;
begin
  select repartidor_id into v_rep from public.pedidos where id = p_pedido;
  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select v_rep, l.producto_id, 'liberacion', l.cantidad, p_pedido, p_actor
  from public.pedido_lineas l where l.pedido_id = p_pedido;
end $$;

-- 1) Crea pedido + apartado de stock + cobro
create or replace function public.crear_pedido_con_cobro(
  p_op uuid, p_repartidor uuid, p_cliente text, p_lineas jsonb, p_vigencia_min int default 15)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; v_ped uuid; v_cob uuid; v_folio bigint; v_total numeric(12,2) := 0;
  l record; v_prod record; v_disp int; v_res jsonb; v_vig timestamptz; v_conc text;
begin
  v_rep := public.iniciar_operacion(p_op, 'crear_pedido', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;

  if not exists (select 1 from public.perfiles where user_id = p_repartidor and rol = 'repartidor' and activo) then
    raise exception 'REPARTIDOR_INVALIDO';
  end if;
  if p_vigencia_min < 6 or p_vigencia_min > 120 then raise exception 'VIGENCIA_INVALIDA'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_repartidor::text));

  insert into public.pedidos (repartidor_id, cliente_alias, total)
  values (p_repartidor, left(trim(p_cliente), 60), 0.01) returning id, folio into v_ped, v_folio;

  for l in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad')::int as cantidad
           from jsonb_array_elements(p_lineas) x loop
    if l.cantidad is null or l.cantidad <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;
    select * into v_prod from public.productos where id = l.producto_id and activo;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    select coalesce(sum(existencia - apartado),0) into v_disp
      from public.v_stock_repartidor where repartidor_id = p_repartidor and producto_id = l.producto_id;
    if v_disp < l.cantidad then raise exception 'SIN_EXISTENCIA: %', v_prod.sku; end if;
    insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
    values (v_ped, l.producto_id, l.cantidad, v_prod.precio, v_prod.precio * l.cantidad);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (p_repartidor, l.producto_id, 'apartado', l.cantidad, v_ped, p_repartidor::text);
    v_total := v_total + v_prod.precio * l.cantidad;
  end loop;

  update public.pedidos set total = v_total where id = v_ped;
  v_vig := now() + make_interval(mins => p_vigencia_min);
  v_conc := 'Refacciones pedido ' || v_folio || ' · Empresa Demo';
  insert into public.cobros (pedido_id, importe, concepto, vigencia_hasta)
  values (v_ped, v_total, v_conc, v_vig) returning id into v_cob;

  perform public.reg_bitacora(p_repartidor::text, 'pedido_creado', v_ped, v_cob, p_op,
    jsonb_build_object('folio', v_folio, 'total', v_total, 'lineas', jsonb_array_length(p_lineas)));
  perform public.reg_bitacora('sistema', 'stock_apartado', v_ped, v_cob, p_op, '{}'::jsonb);

  v_res := jsonb_build_object('pedido_id', v_ped, 'folio', v_folio, 'cobro_id', v_cob,
                              'importe', v_total, 'concepto', v_conc, 'vigencia_hasta', v_vig);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 2) Crea un intento de pago (QR o aviso al celular). Máximo cinco por cobro.
create or replace function public.crear_intento(p_op uuid, p_cobro uuid, p_metodo text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; c public.cobros; v_int uuid; v_ref text; v_exp timestamptz; v_n int; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'crear_intento', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_metodo not in ('qr','push') then raise exception 'METODO_INVALIDO'; end if;

  select * into c from public.cobros where id = p_cobro for update;
  if not found then raise exception 'COBRO_NO_ENCONTRADO'; end if;
  if c.estado = 'pagado' then raise exception 'COBRO_YA_PAGADO'; end if;
  if c.estado in ('vencido','cancelado') or c.vigencia_hasta <= now() then raise exception 'COBRO_NO_VIGENTE'; end if;
  select count(*) into v_n from public.intentos_pago where cobro_id = p_cobro;
  if v_n >= 5 then raise exception 'LIMITE_DE_INTENTOS'; end if;

  v_ref := nextval('public.numref_seq')::text;
  v_exp := now() + interval '360 seconds';
  insert into public.intentos_pago (cobro_id, metodo, num_ref, monto, expira_en)
  values (p_cobro, p_metodo, v_ref, c.importe, v_exp) returning id into v_int;
  update public.cobros set estado = 'en_proceso', actualizado_en = now() where id = p_cobro;

  perform public.reg_bitacora(p_actor, 'intento_creado', c.pedido_id, p_cobro, p_op,
    jsonb_build_object('intento_id', v_int, 'metodo', p_metodo, 'num_ref', v_ref));
  v_res := jsonb_build_object('intento_id', v_int, 'cobro_id', p_cobro, 'num_ref', v_ref,
                              'monto', c.importe, 'concepto', c.concepto, 'expira_en', v_exp);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

create or replace function public.registrar_intento_pey(p_intento uuid, p_pey_id text, p_codi_id text)
returns void language plpgsql as $$
declare v_cob uuid; v_ped uuid;
begin
  update public.intentos_pago set pey_id = p_pey_id, pey_codi_id = p_codi_id
  where id = p_intento returning cobro_id into v_cob;
  select pedido_id into v_ped from public.cobros where id = v_cob;
  perform public.reg_bitacora('sistema', 'cobro_enviado_a_pey', v_ped, v_cob, null,
    jsonb_build_object('intento_id', p_intento, 'pey_id', p_pey_id));
end $$;

create or replace function public.marcar_intento_error(p_intento uuid, p_motivo text)
returns void language plpgsql as $$
declare v_cob uuid; v_ped uuid;
begin
  update public.intentos_pago set estado = 'error' where id = p_intento and estado = 'creado'
  returning cobro_id into v_cob;
  if v_cob is null then return; end if;
  update public.cobros set estado = 'emitido', actualizado_en = now()
  where id = v_cob and estado = 'en_proceso'
    and not exists (select 1 from public.intentos_pago where cobro_id = v_cob and estado = 'creado');
  select pedido_id into v_ped from public.cobros where id = v_cob;
  perform public.reg_bitacora('sistema', 'intento_con_error', v_ped, v_cob, null,
    jsonb_build_object('intento_id', p_intento, 'motivo', left(p_motivo, 200)));
end $$;

-- 3) Concilia un pago confirmado (lo usan el webhook y la conciliación periódica)
create or replace function public.conciliar_pago(
  p_fuente text, p_pey_tx text, p_monto numeric, p_pagado_en timestamptz,
  p_intento uuid, p_cobro uuid, p_num_ref text,
  p_banco text, p_clabe4 text, p_rastreo text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  i public.intentos_pago; c public.cobros; v_res text; v_pago uuid; v_cob uuid; v_ped uuid; v_exp timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('pago:' || p_pey_tx));
  select id into v_pago from public.pagos_confirmados where pey_transaction_id = p_pey_tx;
  if found then return jsonb_build_object('resultado','ya_procesado'); end if;

  if p_intento is not null then select * into i from public.intentos_pago where id = p_intento; end if;
  if i.id is null and p_num_ref is not null then
    select * into i from public.intentos_pago where num_ref = p_num_ref;
  end if;
  v_cob := coalesce(i.cobro_id, p_cobro);
  if v_cob is not null then select * into c from public.cobros where id = v_cob for update; end if;

  if c.id is null then
    v_res := 'sin_cobro';
  elsif c.estado = 'cancelado' then v_res := 'cobro_cancelado';
  elsif c.estado = 'pagado' then v_res := 'duplicado';
  elsif c.estado = 'vencido' then v_res := 'fuera_de_vigencia';
  elsif round(p_monto, 2) <> c.importe then v_res := 'monto_distinto';
  else
    v_exp := coalesce(i.expira_en, c.vigencia_hasta) + interval '30 seconds';
    if p_pagado_en > v_exp then v_res := 'fuera_de_vigencia'; else v_res := 'aplicado'; end if;
  end if;

  insert into public.pagos_confirmados (pey_transaction_id, fuente, intento_id, cobro_id, monto, pagado_en,
    resultado, pagador_banco, pagador_clabe_ultimos4, clave_rastreo)
  values (p_pey_tx, p_fuente, i.id, c.id, round(p_monto,2), p_pagado_en, v_res, p_banco, p_clabe4, p_rastreo)
  returning id into v_pago;

  if v_res = 'aplicado' then
    update public.cobros set estado = 'pagado', pagado_en = p_pagado_en, actualizado_en = now() where id = c.id;
    update public.pedidos set estado = 'pagado', actualizado_en = now() where id = c.pedido_id;
    update public.intentos_pago set estado = 'pagado', pagado_en = p_pagado_en, pey_transaction_id = p_pey_tx
      where id = i.id;
    update public.intentos_pago set estado = 'expirado'
      where cobro_id = c.id and estado = 'creado' and id <> coalesce(i.id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  v_ped := (select pedido_id from public.cobros where id = c.id);
  perform public.reg_bitacora('pey:' || p_fuente,
    case when v_res = 'aplicado' then 'pago_aplicado' else 'pago_con_discrepancia' end,
    v_ped, c.id, null,
    jsonb_build_object('resultado', v_res, 'pey_transaction_id', p_pey_tx, 'monto', round(p_monto,2),
                       'importe_esperado', c.importe, 'num_ref', coalesce(i.num_ref, p_num_ref)));
  return jsonb_build_object('resultado', v_res, 'cobro_id', c.id, 'pedido_id', v_ped, 'pago_id', v_pago);
end $$;

-- 4) El repartidor confirma la entrega: el stock sale de verdad
create or replace function public.marcar_entregado(p_op uuid, p_pedido uuid, p_repartidor uuid)
returns jsonb language plpgsql as $$
declare v_rep jsonb; p public.pedidos; v_res jsonb; v_cob uuid;
begin
  v_rep := public.iniciar_operacion(p_op, 'marcar_entregado', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.repartidor_id <> p_repartidor then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  if p.estado <> 'pagado' then raise exception 'PEDIDO_NO_PAGADO'; end if;
  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select p.repartidor_id, l.producto_id, 'salida', l.cantidad, p.id, p_repartidor::text
  from public.pedido_lineas l where l.pedido_id = p.id;
  update public.pedidos set estado = 'entregado', actualizado_en = now() where id = p.id;
  select id into v_cob from public.cobros where pedido_id = p.id;
  perform public.reg_bitacora(p_repartidor::text, 'pedido_entregado', p.id, v_cob, p_op, '{}'::jsonb);
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'entregado');
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 5) Cancela un pedido aún no pagado y libera el stock
create or replace function public.cancelar_pedido(p_op uuid, p_pedido uuid, p_actor text)
returns jsonb language plpgsql as $$
declare v_rep jsonb; p public.pedidos; v_cob uuid; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'cancelar_pedido', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  if p.estado <> 'por_cobrar' then raise exception 'PEDIDO_NO_CANCELABLE'; end if;
  update public.cobros set estado = 'cancelado', actualizado_en = now()
    where pedido_id = p.id returning id into v_cob;
  update public.intentos_pago set estado = 'expirado' where cobro_id = v_cob and estado = 'creado';
  update public.pedidos set estado = 'cancelado', actualizado_en = now() where id = p.id;
  perform public.liberar_pedido(p.id, p_actor);
  perform public.reg_bitacora(p_actor, 'pedido_cancelado', p.id, v_cob, p_op, '{}'::jsonb);
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'cancelado');
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 6) Vence intentos y cobros sin pago, y libera el stock. Se llama desde las funciones y desde el tablero.
create or replace function public.expirar_vencidos()
returns jsonb language plpgsql as $$
declare r record; v_i int; v_c int := 0;
begin
  update public.intentos_pago set estado = 'expirado'
  where estado = 'creado' and expira_en + interval '30 seconds' < now();
  get diagnostics v_i = row_count;
  for r in
    select c.id as cobro_id, c.pedido_id from public.cobros c
    where c.estado in ('emitido','en_proceso') and c.vigencia_hasta < now()
      and not exists (select 1 from public.intentos_pago i where i.cobro_id = c.id and i.estado = 'creado')
    for update of c skip locked
  loop
    update public.cobros set estado = 'vencido', actualizado_en = now() where id = r.cobro_id;
    update public.pedidos set estado = 'cancelado', actualizado_en = now() where id = r.pedido_id;
    perform public.liberar_pedido(r.pedido_id, 'sistema');
    perform public.reg_bitacora('sistema', 'cobro_vencido', r.pedido_id, r.cobro_id, null, '{}'::jsonb);
    v_c := v_c + 1;
  end loop;
  return jsonb_build_object('intentos_expirados', v_i, 'cobros_vencidos', v_c);
end $$;

-- 7) El administrador resuelve un pago con discrepancia
create or replace function public.resolver_pago(
  p_op uuid, p_pago uuid, p_accion text, p_nota text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; g public.pagos_confirmados; c public.cobros; p public.pedidos; l record; v_disp int; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'resolver_pago', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_nota is null or char_length(trim(p_nota)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  select * into g from public.pagos_confirmados where id = p_pago for update;
  if not found then raise exception 'PAGO_NO_ENCONTRADO'; end if;
  if g.resultado = 'aplicado' then raise exception 'PAGO_SIN_DISCREPANCIA'; end if;

  if p_accion = 'aceptar' then
    if g.resultado <> 'fuera_de_vigencia' or g.resolucion is not null then raise exception 'ACCION_NO_PERMITIDA'; end if;
    select * into c from public.cobros where id = g.cobro_id for update;
    if c.estado in ('pagado','cancelado') then raise exception 'ACCION_NO_PERMITIDA'; end if;
    if g.monto <> c.importe then raise exception 'ACCION_NO_PERMITIDA'; end if;
    select * into p from public.pedidos where id = c.pedido_id for update;
    if p.estado = 'cancelado' then
      perform pg_advisory_xact_lock(hashtext(p.repartidor_id::text));
      for l in select * from public.pedido_lineas where pedido_id = p.id loop
        select coalesce(sum(existencia - apartado),0) into v_disp
          from public.v_stock_repartidor where repartidor_id = p.repartidor_id and producto_id = l.producto_id;
        if v_disp < l.cantidad then raise exception 'SIN_EXISTENCIA'; end if;
      end loop;
      insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
      select p.repartidor_id, l2.producto_id, 'apartado', l2.cantidad, p.id, p_actor
      from public.pedido_lineas l2 where l2.pedido_id = p.id;
    end if;
    update public.cobros set estado = 'pagado', pagado_en = g.pagado_en, actualizado_en = now() where id = c.id;
    update public.pedidos set estado = 'pagado', actualizado_en = now() where id = p.id;
    update public.pagos_confirmados set resolucion = 'aceptado', nota_resolucion = p_nota,
      resuelto_por = p_actor, resuelto_en = now() where id = g.id;
  elsif p_accion = 'devolver' then
    if g.resolucion is not null then raise exception 'ACCION_NO_PERMITIDA'; end if;
    update public.pagos_confirmados set resolucion = 'devolucion_pendiente', nota_resolucion = p_nota,
      resuelto_por = p_actor, resuelto_en = now() where id = g.id;
  elsif p_accion = 'devuelto' then
    if g.resolucion is distinct from 'devolucion_pendiente' then raise exception 'ACCION_NO_PERMITIDA'; end if;
    update public.pagos_confirmados set resolucion = 'devuelto', nota_resolucion = p_nota,
      resuelto_por = p_actor, resuelto_en = now() where id = g.id;
  else
    raise exception 'ACCION_INVALIDA';
  end if;

  perform public.reg_bitacora(p_actor, 'pago_resuelto', (select pedido_id from public.cobros where id = g.cobro_id),
    g.cobro_id, p_op, jsonb_build_object('pago_id', g.id, 'accion', p_accion, 'nota', left(p_nota, 300)));
  v_res := jsonb_build_object('pago_id', g.id, 'accion', p_accion);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 8) Comprobación de integridad: recalcula lo derivado y busca diferencias
create or replace function public.verificar_integridad()
returns table (prueba text, ok boolean, detalle text) language plpgsql set search_path = public, extensions as $$
declare v_bad bigint; v_n bigint;
begin
  select count(*) into v_n from public.bitacora;
  select min(x.id) into v_bad from (
    select b.id, b.hash, b.hash_previo,
      lag(b.hash) over (order by b.id) as hash_ant,
      encode(digest(
        coalesce(lag(b.hash) over (order by b.id),'') || '|' || b.id::text || '|' ||
        to_char(b.ocurrio_en at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
        b.actor || '|' || b.accion || '|' ||
        coalesce(b.pedido_id::text,'') || '|' || coalesce(b.cobro_id::text,'') || '|' ||
        coalesce(b.operacion_id::text,'') || '|' || b.detalle::text, 'sha256'), 'hex') as esperado
    from public.bitacora b) x
  where x.hash <> x.esperado or x.hash_previo is distinct from x.hash_ant;
  prueba := 'Cadena de huellas de la bitácora'; ok := v_bad is null;
  detalle := case when v_bad is null then v_n || ' filas verificadas' else 'primera fila alterada: ' || v_bad end;
  return next;

  select count(*) into v_n from public.cobros c
  where (c.estado = 'pagado') <> exists (select 1 from public.pagos_confirmados g
        where g.cobro_id = c.id and (g.resultado = 'aplicado' or g.resolucion = 'aceptado'));
  prueba := 'Cobros pagados coinciden con pagos aplicados'; ok := v_n = 0;
  detalle := v_n || ' diferencias'; return next;

  select count(*) into v_n from public.v_stock_repartidor where existencia < 0 or existencia - apartado < 0;
  prueba := 'Stock sin saldos negativos'; ok := v_n = 0; detalle := v_n || ' casos'; return next;

  select count(*) into v_n from (
    select p.id, coalesce((select sum(l.cantidad) from public.pedido_lineas l where l.pedido_id = p.id),0) as lineas,
      coalesce((select sum(m.cantidad) from public.movimientos_stock m where m.pedido_id = p.id and m.tipo = 'apartado'),0)
      - coalesce((select sum(m.cantidad) from public.movimientos_stock m where m.pedido_id = p.id and m.tipo in ('liberacion','salida')),0) as apartado_vivo,
      p.estado
    from public.pedidos p) q
  where (q.estado in ('por_cobrar','pagado') and q.apartado_vivo <> q.lineas)
     or (q.estado in ('entregado','cancelado') and q.apartado_vivo <> 0);
  prueba := 'Stock apartado coincide con los pedidos vivos'; ok := v_n = 0; detalle := v_n || ' pedidos con diferencia';
  return next;
end $$;

-- Permisos: solo el rol de servicio (las Edge Functions) puede ejecutar la lógica
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
```

### Bloque 3 — datos de demostración

Antes de correrlo, Polo crea en Authentication tres usuarios con estos correos y contraseñas que él elige (las contraseñas no van en el repositorio): `admin@demo.invalid`, `repartidor1@demo.invalid`, `repartidor2@demo.invalid`.

```sql
-- BLOQUE 3 · DATOS DE DEMOSTRACIÓN (correr DESPUÉS de crear los tres usuarios en Authentication)
-- Usuarios esperados: admin@demo.invalid, repartidor1@demo.invalid, repartidor2@demo.invalid
insert into public.perfiles (user_id, rol, nombre)
select id, 'admin', 'Administración Demo' from auth.users where email = 'admin@demo.invalid'
on conflict (user_id) do nothing;
insert into public.perfiles (user_id, rol, nombre)
select id, 'repartidor', 'Repartidor Uno' from auth.users where email = 'repartidor1@demo.invalid'
on conflict (user_id) do nothing;
insert into public.perfiles (user_id, rol, nombre)
select id, 'repartidor', 'Repartidor Dos' from auth.users where email = 'repartidor2@demo.invalid'
on conflict (user_id) do nothing;

-- Catálogo inventado. Precios de demostración en centavos para no mover dinero real significativo.
insert into public.productos (sku, nombre, precio) values
  ('DEMO-BAL-01', 'Balata delantera (juego)', 0.03),
  ('DEMO-CAD-01', 'Cadena de transmisión 428', 0.05),
  ('DEMO-BUJ-01', 'Bujía estándar', 0.01),
  ('DEMO-FIL-01', 'Filtro de aceite', 0.02),
  ('DEMO-CLU-01', 'Cable de clutch', 0.02),
  ('DEMO-FOC-01', 'Foco delantero LED', 0.04)
on conflict (sku) do nothing;

-- Carga inicial de la camioneta: 10 piezas de cada producto por repartidor
insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, actor)
select pf.user_id, pr.id, 'carga', 10, 'sembrado'
from public.perfiles pf cross join public.productos pr
where pf.rol = 'repartidor'
  and not exists (select 1 from public.movimientos_stock m
                  where m.repartidor_id = pf.user_id and m.producto_id = pr.id and m.tipo = 'carga');

select public.reg_bitacora('sembrado', 'datos_demo_cargados', null, null, null, '{}'::jsonb);
```

## 6. Funciones (Edge Functions)

Todas responden JSON, validan la entrada con esquema (Zod), limitan el tamaño del cuerpo, llaman a `expirar_vencidos()` al empezar y nunca devuelven mensajes internos de error. Traduce los errores de la base (`SIN_EXISTENCIA`, `COBRO_NO_VIGENTE`, `LIMITE_DE_INTENTOS`, `PEDIDO_NO_PAGADO`, etc.) a mensajes claros en español.

| Función | Acceso | Qué hace |
| --- | --- | --- |
| `catalogo` | Repartidor | Productos activos con la existencia, lo apartado y lo **disponible** de su camioneta. |
| `crear-pedido` | Repartidor | Recibe `operacion_id`, alias del cliente y líneas. Llama a `crear_pedido_con_cobro`. Devuelve folio, importe, concepto y vigencia. |
| `crear-intento-pago` | Repartidor dueño del pedido | Recibe `operacion_id`, `cobro_id`, método (`qr` o `push`) y, para `push`, el celular de 10 dígitos. Llama a `crear_intento`; luego a pey (`/codi/qr` con `generateImage` o `/codi/pn`) con `numRef`, `concept` y `metadata` (`intento_id`, `cobro_id`); **sin `bankAccountId` si la llave ya está ligada**. Guarda el **id del QR** (o del aviso) con `registrar_intento_pey`; el `transactionId` llega con el pago. Si pey falla, llama a `marcar_intento_error` y devuelve un mensaje claro. |
| `comprobante` | Público (sin sesión) | Recibe la clave larga del comprobante. Devuelve empresa, cuenta destino (últimos 4), folio, piezas, monto, fecha, `num_ref` y clave de rastreo. Sin pagador ni repartidor. |
| `estado-pedido` | Repartidor dueño | Estado actual del pedido, cobro y último intento, con segundos restantes del QR. La pantalla lo consulta cada 3 segundos mientras espera. |
| `marcar-entregado` | Repartidor dueño | Llama a `marcar_entregado`. |
| `cancelar-pedido` | Repartidor dueño o administrador | Llama a `cancelar_pedido`. |
| `mi-camioneta` | Repartidor | Su stock derivado de los movimientos. |
| `webhook-pey` | Pública, sin JWT | Sección 4.4. |
| `conciliar-con-pey` | Administrador | Sección 4.7. |
| `tablero` | Administrador | Indicadores del día (cobrado, pendiente, vencido, pagos por resolver, recuperados por conciliación), resumen por repartidor (pedidos, cobrado, stock restante), lista de pedidos con filtros, detalle con intentos y bitácora, y lista de pagos con discrepancia. |
| `resolver-pago` | Administrador | Llama a `resolver_pago` con `aceptar`, `devolver` o `devuelto`, y nota obligatoria. |
| `verificar-integridad` | Administrador | Llama a `verificar_integridad()`. |

## 7. Pantallas

**Repartidor (celular):**

1. Inicio de sesión.
2. Mis pedidos del día, con estado de cada uno y un botón grande «Nuevo pedido».
3. Nuevo pedido: alias del cliente, catálogo con cantidades (+/−) y **disponible** por pieza, total en vivo. Botón «Generar cobro».
4. Cobrar: QR grande y centrado, monto, concepto, cuenta regresiva y el estado, que cambia solo a «Pagado» cuando llega la confirmación. Opción secundaria «Enviar aviso al celular del cliente» (pide los 10 dígitos y explica que solo se usa para enviar el aviso). Si el QR vence, botón para generar otro (hasta cinco).
5. Pagado: pantalla grande y verde para mostrarle al cliente (folio, concepto, importe, fecha y hora, clave de rastreo y la leyenda de demostración) y el botón «Marcar entregado».
6. Mi camioneta: existencia, apartado y disponible por pieza.

**Administrador (escritorio o tableta):**

1. Inicio de sesión.
2. Indicadores del día y resumen por repartidor.
3. Tabla de pedidos y cobros con filtros y actualización automática.
4. Pagos por resolver, con motivo y acciones.
5. Detalle de un pedido con su bitácora cronológica.
6. Botones «Conciliar con pey» y «Verificar integridad».

Accesibilidad: contraste suficiente, etiquetas en formularios, navegación con teclado, estados de carga y error claros.

## 8. Pruebas y simulador

- Pruebas automáticas de: verificación de firma (válida, inválida, cuerpo alterado), idempotencia por `webhook-id`, `extraerDatosPago` con los dos payloads documentados, y el flujo de punta a punta contra una base local con el SQL de la sección 5 (las doce situaciones listadas allí).
- Script `scripts/simular-webhook` que firma y envía un aviso de prueba con el secreto local, usando el formato documentado de pey, para ensayar sin mover dinero. Es solo de desarrollo, no se expone desde el navegador, y si se usa en el demo en vivo se dice abiertamente que es simulación.

## 9. Seguridad

- Secretos solo como secretos de Supabase y variables de Vercel: `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `SITE_URL`. `PEY_BANK_ACCOUNT_ID` es opcional (solo si la llave no está ligada). `PEY_CUENTA_ULTIMOS4` y `PEY_EMPRESA_NOMBRE` alimentan el comprobante del cliente. Nunca en el código ni en el repositorio.
- Encabezados de seguridad y CORS restringido a `SITE_URL`. Nada de `console.log` de payloads completos.
- Antes de cada push y al terminar, busca en todo el repositorio y su historial cualquier cadena parecida a una llave, token, CLABE o teléfono real y confirma que no hay ninguna.

## 10. Git y documentación viva (obligatoria, según el plan de desarrollo de Yoltik)

Mantener el repositorio actualizado y con información correcta es parte del trabajo, no un adorno. Quien lo lea debe entender en cinco minutos qué se construye, qué funciona y qué falta.

### 10.1 Repositorio

El repositorio público vacío ya fue creado por Polo y está clonado en tu espacio de trabajo. Si no hay un repositorio git con remoto, **detente y dile a Polo que lo cree**; es la única parada permitida.

### 10.2 Flujo de ramas (Git Flow simplificado)

`main` solo contiene lo que ya funciona y fue probado. `develop` es la rama de integración. Cada pieza se trabaja en una rama `feature/<nombre-corto>` que sale de `develop` y vuelve a `develop` con un pull request. Al cierre, `develop` pasa a `main` con un pull request. Mensajes de commit en español, con el formato `tipo: qué cambió` (`feat`, `fix`, `docs`, `test`, `chore`), en una línea clara y sin mezclar temas. Un commit por cada hito, como mínimo después de: esquema SQL, lógica SQL, funciones, pantallas del repartidor, tablero, pruebas, documentación. Las ramas que ya se integraron se conservan en el historial.

### 10.3 Archivos que se mantienen al día

1. `README.md`: qué es, el problema, el recorrido de un cobro con diagrama Mermaid, reglas de conciliación, seguridad y privacidad, instalación (con el SQL de la sección 5), variables, **qué está verificado frente a pey y qué es suposición**, limitaciones (demostración, un ambiente, sin sandbox, gratuidad de la API «por el momento», precios en centavos), cómo correr las pruebas y siguiente fase.
2. `docs/BITACORA-DE-DESARROLLO.md`: una línea por hito, con fecha y hora de CDMX, qué se hizo, qué se probó y qué quedó pendiente. Se actualiza en el mismo commit que el hito.
3. `docs/PEY-VERIFICADO.md`: tabla de cada dato de pey con su fuente (URL), si está **verificado en documentación**, **verificado con un pago real** o **supuesto**, y la fecha. Los datos que se confirmen con el primer webhook real se actualizan ahí.
4. `docs/cuaderno-de-datos.md`: el documento que explica cómo está construido el producto, en siete partes: 1) qué es y para quién; 2) recorrido de un dato (orden → compuerta → hecho en la base → historial y bitácora → consulta, con conciliación), con diagrama Mermaid; 3) mapa de datos por área con su dueño, con diagrama; 4) quién ve qué (tabla de datos por rol: repartidor, administrador, función de servicio, navegador); 5) ciclo de vida de un dato hasta su borrado, con diagrama; 6) la bitácora con un ejemplo real de las siete preguntas (qué pasó, sobre qué, quién, cuándo ocurrió y cuándo se registró, desde dónde, por qué, bajo qué regla); 7) tablero de las nueve reglas de datos (una sola base central; escritura con identificador propio; historial que no se borra; derivadas reconstruibles; escritura solo por la compuerta; corte visible; integridad antes que puntualidad; cambio gradual; borrado diseñado) con cómo se aplica, cómo se comprueba y su estado honesto (Cumple, Parcial o Fuera de la demostración). Cierra con un glosario en lenguaje simple, sin analogías contables.
5. `docs/GUION-DEMO.md`: guion de tres minutos para el demo en vivo, paso a paso.
6. `.env.example` y `.gitignore`.

## 11. Criterios de aceptación

1. Un repartidor inicia sesión, arma un pedido con piezas de su camioneta y genera el cobro con QR.
2. Un pago real de $0.01 a $0.10 desde una app bancaria cambia el pedido a «Pagado» en el celular del repartidor y en el tablero sin recargar, y se muestra el comprobante.
3. Al marcar la entrega, el stock de esa camioneta baja y el tablero lo refleja.
4. Un webhook con firma inválida no cambia nada y queda en la bitácora; un reenvío no duplica efectos.
5. Un pago con monto distinto, fuera de vigencia, duplicado o sobre un cobro cancelado queda como discrepancia con su motivo y el administrador puede resolverlo.
6. Un pago que se perdió como webhook se recupera con «Conciliar con pey».
7. Un repartidor no puede ver pedidos ni stock de otro. El navegador no puede leer ni escribir tablas directamente.
8. «Verificar integridad» muestra las cuatro pruebas en verde.
9. Todas las pruebas pasan, el repositorio no contiene secretos y los seis archivos de la sección 10.3 existen, están completos y coinciden con lo construido.
10. Nada en la aplicación la hace pasar por un producto de una empresa real.

## 12. Lo que no debes hacer

- No reimplementes la conciliación en TypeScript ni escribas tablas desde el navegador.
- No uses un QR con monto cero.
- No marques un pago como aplicado sin firma válida ni sin la confirmación con pey cuando el aviso trae `transactionId`.
- No guardes teléfonos, CLABE completas ni datos personales que no necesites.
- No inventes campos del webhook más allá de los documentados.
- No agregues disputas, devoluciones por API, tarjeta, correo ni stock editable desde la interfaz.
- No dejes URLs, llaves, CLABE o contraseñas reales en el repositorio.
- No hagas `push --force` ni reescribas historial.

## 13. Informe final (entrégalo al terminar)

Texto breve y claro, sin tecnicismos innecesarios, con: qué quedó construido; qué se probó y cómo; qué es suposición y qué está verificado respecto a pey; los pasos manuales de Polo (crear el proyecto de Supabase, correr los bloques SQL en orden, crear los tres usuarios, configurar los secretos, dar de alta la CLABE y la llave en el portal de pey, crear el webhook con la URL de `webhook-pey`, conectar Vercel, hacer el primer pago de $0.01 y copiar el payload real para `docs/PEY-VERIFICADO.md`); cualquier cambio al SQL, pegado completo; el estado de las ramas y el último commit de `main`; y los riesgos que quedan para el demo.
