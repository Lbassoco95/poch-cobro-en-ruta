# Poch · cobro en ruta con CoDi

**Poch** (por *Pochteca*, los comerciantes que recorrían rutas en Mesoamérica) convierte el celular de un repartidor en su terminal de cobro. Administración arma la ruta del día con remisiones. El repartidor recorre las paradas en orden, cobra el monto del documento con un QR de CoDi y confirma la entrega con foto y firma. El dinero va **directo de la cuenta del cliente a la cuenta de la empresa**.

Proyecto del **Cursor Hackatón México (CDMX, 14–15 de noviembre de 2026)**, construido con la API de pey.

> **Demostración con datos ficticios. Sin validez fiscal.** Empresa, repartidores, clientes y catálogo son inventados. Los precios están en centavos porque las pruebas con pey son en producción y no se devuelven.

## El problema

En refaccionarias con venta en ruta, el repartidor cobra en efectivo o pide una transferencia a una CLABE personal. El dinero tarda en cuadrar, el stock de la camioneta no se actualiza al momento y la empresa no ve el cobro hasta horas después. Poch deja que el celular del repartidor cobre con CoDi a nombre de la empresa.

## Pantallas

El aspecto sale de `docs/diseno/poch-ruta.html`: fondo oscuro, vidrio y fondo vivo. De 640 px hacia abajo el repartidor usa la pantalla completa. Hacia arriba se ve dentro de un marco de teléfono. Administración usa todo el ancho.

- Repartidor: ingreso, mi ruta, remisión, cobro con QR, estado, entrega con foto y firma, cambio de orden e historial.
- Administración: tablero, rutas, pagos por resolver, bitácora e integridad, y guía de estilo (`/estilo`).
- El cliente abre el comprobante en `/c/:clave`, sin iniciar sesión.

La ruta no tiene zona: producción no guarda ese dato. Al cerrar una ruta, la pantalla muestra entregados, devueltos y cobrado. El aviso de cambio de orden lee los folios que guarda la bitácora.

## Recorrido de un cobro

```mermaid
sequenceDiagram
  participant R as Repartidor
  participant A as Poch (compuerta)
  participant B as Base
  participant P as pey / CoDi
  participant C as Cliente (banco)

  R->>A: Nuevo pedido + generar cobro
  A->>B: crear_pedido_con_cobro (aparta stock)
  A->>B: crear_intento
  A->>P: POST /codi/qr (sin bankAccountId si la llave ya está ligada)
  P-->>A: id del QR, qrString, qrImage
  A->>B: registrar id del QR en el intento
  A-->>R: muestra QR
  C->>P: paga desde su banco
  Note over P: ~3 s hasta confirmar (medido)
  P->>A: webhook firmado (transactionId, codiQrId, numRef)
  A->>P: GET /transaction/{id} (PAID y monto)
  A->>B: conciliar_pago
  B-->>A: aplicado + clave de comprobante
  A-->>R: pantalla Pagado (sin recargar)
```

## Reglas de conciliación

Un pago se **aplica** solo si el cobro no está pagado, vencido ni cancelado, el monto es igual al importe y llegó dentro de la vigencia del intento (más 30 segundos). Si no, queda como discrepancia (`monto_distinto`, `fuera_de_vigencia`, `duplicado`, `cobro_cancelado`, `sin_cobro`) para que el administrador lo resuelva.

Se liga el pago al intento por el **id del QR** (`codiQrId`) y por **`numRef`** (sí viaja al banco del pagador). Como segunda llave, `intento_id` en `externalMetadata`. La conciliación periódica usa `GET /transaction/codi/qr/{qrId}` (lista vacía = aún no pagó).

## Seguridad y privacidad

- El navegador solo usa supabase-js para iniciar sesión. Todo lo demás pasa por Edge Functions con el rol de servicio.
- RLS activo sin políticas; `anon` y `authenticated` no leen ni escriben tablas.
- Del pagador se guardan banco, tipo de cuenta, últimos 4 de la CLABE y clave de rastreo. Nunca la CLABE completa ni el teléfono del aviso.
- Un aviso de pey con firma inválida o con fecha fuera de 5 minutos se rechaza con 401 y no se guarda nada.
- La bitácora solo admite agregar y encadena huellas. `verificar_integridad()` **detecta** alteraciones; no las impide a quien administra la base.
- Aviso de privacidad (LFPDPPP): esta demostración trata datos ficticios. En un producto real, la empresa es responsable del tratamiento; se recogen solo los datos necesarios para cobrar y conciliar; el cliente puede ejercer derechos ARCO ante la empresa; no se comparten CLABEs completas ni teléfonos.

## Qué está verificado frente a pey y qué es supuesto

Resumen vivo en [`docs/PEY-VERIFICADO.md`](docs/PEY-VERIFICADO.md). Verificado con pago real de **$0.01 el 14-nov-2026**: respuesta de `POST /codi/qr`, no enviar `bankAccountId` si la llave está ligada, liga por `codiQrId`/`numRef`, `GET /transaction/codi/qr/{id}`, tiempo de 3 segundos y datos del pagador. Siguen abiertos: reintentos del webhook, devoluciones por API y vigencia máxima del QR.

## Limitaciones de la demostración

- Un solo ambiente. Un producto real tendría desarrollo, QA y producción separados.
- Sin sandbox de pey: las pruebas mueven dinero real (centavos).
- La API de pey es gratuita «por el momento».
- Precios del catálogo de $0.01 a $0.05.
- Sin disputas, devoluciones por API, tarjeta, correo, edición de stock en pantalla ni facturación fiscal (siguiente fase).

## Instalación

1. Cree un proyecto de Supabase (Postgres 16) y anote la URL y las llaves.
2. En el editor SQL, corra **en este orden**: Bloque 1, Bloque 2, Bloque 2b (ajuste del pago real), Bloque 2c (un solo QR vigente por cobro), Bloque 2d (ruta y entrega), Bloque 2e (reorden de paradas y orden de compra), cree los tres usuarios en Authentication, Bloque 3.
3. Usuarios de demostración (contraseña la define usted en el panel): `admin@demo.invalid`, `repartidor1@demo.invalid`, `repartidor2@demo.invalid`.
4. Despliegue las Edge Functions de `supabase/functions/` y configure los secretos (nombres en `.env.example`).
5. Registre en pey la URL pública de `webhook-pey`.
6. Despliegue el frontend (`npm run build`) con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
7. Copias listas también en `supabase/sql/` (`01-esquema`, `02-logica`, `02b-pago-real`, `02c-intento-unico-vigente`, `02d-ruta-entrega`, `02e-reorden-paradas-orden-compra`, `datos-demo`, `datos-demo-ruta`). Las mismas migraciones están en `supabase/migrations/`.

### Variables

| Nombre | Dónde | Notas |
| --- | --- | --- |
| `PEY_API_KEY` | Secretos de funciones | Obligatoria para cobrar |
| `PEY_WEBHOOK_SECRET` | Secretos de funciones | Obligatoria para avisos |
| `PEY_BANK_ACCOUNT_ID` | Secretos de funciones | **Opcional.** Solo si la llave no está ligada a una cuenta |
| `PEY_CUENTA_ULTIMOS4` | Secretos de funciones | Últimos 4 de la CLABE de la empresa (comprobante del cliente) |
| `PEY_EMPRESA_NOMBRE` | Secretos de funciones | Nombre en el comprobante público |
| `SITE_URL` | Secretos de funciones | Origen permitido en CORS |
| `VITE_SUPABASE_URL` | Frontend | Pública |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Pública |

### Bloque 1 · esquema

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

### Bloque 2 · lógica

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

### Bloque 2b · ajuste tras pago real ($0.01, 14-nov-2026)

```sql
-- Ajustes tras el pago real de $0.01 (14-nov-2026). No modifica las migraciones ya probadas.
-- Agrega tipo de cuenta del pagador, clave pública del comprobante y liga por id del QR.

alter table public.pagos_confirmados
  add column if not exists pagador_tipo_cuenta text;

alter table public.cobros
  add column if not exists comprobante_clave text;

create unique index if not exists un_cobros_comprobante_clave
  on public.cobros (comprobante_clave)
  where comprobante_clave is not null;

-- Sustituye la firma anterior (sin tipo de cuenta ni id del QR).
drop function if exists public.conciliar_pago(text, text, numeric, timestamptz, uuid, uuid, text, text, text, text);

create or replace function public.conciliar_pago(
  p_fuente text, p_pey_tx text, p_monto numeric, p_pagado_en timestamptz,
  p_intento uuid, p_cobro uuid, p_num_ref text,
  p_banco text, p_clabe4 text, p_rastreo text,
  p_tipo_cuenta text default null,
  p_pey_qr text default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  i public.intentos_pago; c public.cobros; v_res text; v_pago uuid; v_cob uuid; v_ped uuid; v_exp timestamptz; v_clave text;
begin
  perform pg_advisory_xact_lock(hashtext('pago:' || p_pey_tx));
  select id into v_pago from public.pagos_confirmados where pey_transaction_id = p_pey_tx;
  if found then return jsonb_build_object('resultado','ya_procesado'); end if;

  if p_intento is not null then select * into i from public.intentos_pago where id = p_intento; end if;
  if i.id is null and p_pey_qr is not null then
    select * into i from public.intentos_pago
      where pey_id = p_pey_qr or pey_codi_id = p_pey_qr
      order by creado_en desc limit 1;
  end if;
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
    resultado, pagador_banco, pagador_clabe_ultimos4, clave_rastreo, pagador_tipo_cuenta)
  values (p_pey_tx, p_fuente, i.id, c.id, round(p_monto,2), p_pagado_en, v_res, p_banco, p_clabe4, p_rastreo, p_tipo_cuenta)
  returning id into v_pago;

  if v_res = 'aplicado' then
    update public.cobros set estado = 'pagado', pagado_en = p_pagado_en, actualizado_en = now() where id = c.id;
    update public.pedidos set estado = 'pagado', actualizado_en = now() where id = c.pedido_id;
    update public.intentos_pago set estado = 'pagado', pagado_en = p_pagado_en, pey_transaction_id = p_pey_tx
      where id = i.id;
    update public.intentos_pago set estado = 'expirado'
      where cobro_id = c.id and estado = 'creado' and id <> coalesce(i.id, '00000000-0000-0000-0000-000000000000'::uuid);
    if c.comprobante_clave is null then
      v_clave := encode(gen_random_bytes(32), 'hex');
      update public.cobros set comprobante_clave = v_clave where id = c.id;
    else
      v_clave := c.comprobante_clave;
    end if;
  end if;

  v_ped := (select pedido_id from public.cobros where id = c.id);
  perform public.reg_bitacora('pey:' || p_fuente,
    case when v_res = 'aplicado' then 'pago_aplicado' else 'pago_con_discrepancia' end,
    v_ped, c.id, null,
    jsonb_build_object('resultado', v_res, 'pey_transaction_id', p_pey_tx, 'monto', round(p_monto,2),
                       'importe_esperado', c.importe, 'num_ref', coalesce(i.num_ref, p_num_ref),
                       'pey_qr', p_pey_qr));
  return jsonb_build_object('resultado', v_res, 'cobro_id', c.id, 'pedido_id', v_ped, 'pago_id', v_pago,
                            'comprobante_clave', v_clave);
end $$;

revoke execute on function public.conciliar_pago(text, text, numeric, timestamptz, uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.conciliar_pago(text, text, numeric, timestamptz, uuid, uuid, text, text, text, text, text, text)
  to service_role;

```

### Bloque 2c · un solo QR vigente por cobro

No se genera un QR nuevo mientras el anterior siga vigente (más 30 segundos de tolerancia); la base responde `INTENTO_VIGENTE` y la aplicación muestra un mensaje claro. Archivo: `supabase/sql/02c-intento-unico-vigente.sql`.

```sql
-- Un solo QR vivo por cobro: no se genera uno nuevo mientras el anterior siga vigente (más 30 s de tolerancia).
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
  if exists (select 1 from public.intentos_pago
             where cobro_id = p_cobro and estado = 'creado'
               and expira_en + interval '30 seconds' > now()) then
    raise exception 'INTENTO_VIGENTE';
  end if;

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
```

### Bloque 2d · ruta de entrega, documentos y evidencia

Es el SQL **original** que se aplicó en producción el 14-nov-2026. Crea rutas, documentos de venta como paradas, la evidencia de entrega (foto y firma, o excepción con nota que queda para revisión) y el bucket privado `evidencias`. Reemplaza `crear_intento`, `marcar_entregado`, `expirar_vencidos`, `cancelar_pedido` y `verificar_integridad` (esta última queda con cinco pruebas). **El bloque 2d redefine `crear_intento` con la regla del 2c: en un proyecto donde ya corrió el 2d no se debe correr el 2c después, porque lo degradaría.** Archivo: `supabase/sql/02d-ruta-entrega.sql`.

```sql
-- FASE 2 · Ruta de entrega y cobro, con evidencia de entrega (foto y firma del cliente)
-- Aditiva: no borra datos. Reemplaza marcar_entregado, crear_intento, expirar_vencidos, cancelar_pedido y verificar_integridad.

-- 1) Rutas: el día de trabajo de un repartidor
create table public.rutas (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid not null references public.perfiles(user_id),
  nombre text not null check (char_length(nombre) between 1 and 60),
  fecha date not null,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  creado_por text not null,
  creado_en timestamptz not null default now(),
  cerrada_en timestamptz
);
create index on public.rutas (repartidor_id, fecha);

-- 2) El documento de venta (remisión, nota de venta u orden de compra) vive en pedidos
alter table public.pedidos
  add column if not exists ruta_id uuid references public.rutas(id),
  add column if not exists tipo_documento text check (tipo_documento in ('remision','nota_venta','orden_compra')),
  add column if not exists folio_documento text check (folio_documento is null or char_length(folio_documento) between 1 and 40),
  add column if not exists parada int check (parada is null or parada > 0);
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente','por_cobrar','pagado','entregado','cancelado','devuelto'));
alter table public.pedidos add constraint pedidos_documento_completo
  check ((tipo_documento is null) = (folio_documento is null));
create unique index un_documento_por_tipo_y_folio on public.pedidos (tipo_documento, folio_documento)
  where tipo_documento is not null;
create index on public.pedidos (ruta_id, parada);
alter table public.cobros add column if not exists reabierto_en timestamptz;

-- 3) Evidencia de entrega: foto, firma y quién recibió. No se modifica ni se borra.
create table public.entregas_evidencia (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id),
  recibe_nombre text not null check (char_length(trim(recibe_nombre)) between 1 and 80),
  foto_ruta text,
  foto_hash text check (foto_hash is null or foto_hash ~ '^[0-9a-f]{64}$'),
  firma_ruta text,
  firma_hash text check (firma_hash is null or firma_hash ~ '^[0-9a-f]{64}$'),
  excepcion text check (excepcion in ('recibio_tercero','cliente_no_firma','sin_foto')),
  nota text,
  latitud numeric(9,6) check (latitud is null or latitud between -90 and 90),
  longitud numeric(9,6) check (longitud is null or longitud between -180 and 180),
  requiere_revision boolean not null default false,
  revisada_por text,
  revisada_en timestamptz,
  nota_revision text,
  capturada_por text not null,
  capturada_en timestamptz not null default now(),
  check ((excepcion is null and foto_ruta is not null and foto_hash is not null
          and firma_ruta is not null and firma_hash is not null)
      or (excepcion is not null and nota is not null and char_length(trim(nota)) >= 5)),
  check (requiere_revision = (excepcion is not null))
);

create or replace function public.evidencia_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las evidencias de entrega no se borran'; end if;
  if (new.id, new.pedido_id, new.recibe_nombre, new.foto_ruta, new.foto_hash, new.firma_ruta, new.firma_hash,
      new.excepcion, new.nota, new.latitud, new.longitud, new.requiere_revision, new.capturada_por, new.capturada_en)
     is distinct from
     (old.id, old.pedido_id, old.recibe_nombre, old.foto_ruta, old.foto_hash, old.firma_ruta, old.firma_hash,
      old.excepcion, old.nota, old.latitud, old.longitud, old.requiere_revision, old.capturada_por, old.capturada_en)
  then raise exception 'La evidencia de entrega no se modifica'; end if;
  return new;
end $$;
create trigger evidencia_no_modificar before update or delete on public.entregas_evidencia
for each row execute function public.evidencia_inmutable();
create trigger evidencia_no_vaciar before truncate on public.entregas_evidencia
for each statement execute function public.solo_agregar();

-- Compuerta: RLS activo, sin políticas; solo el rol de servicio entra
alter table public.rutas enable row level security;
alter table public.entregas_evidencia enable row level security;
revoke all on public.rutas, public.entregas_evidencia from anon, authenticated;
grant all on public.rutas, public.entregas_evidencia to service_role;

-- Almacenamiento privado para fotos y firmas (si el esquema storage existe; si no, créalo a mano con el mismo nombre)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidencias', 'evidencias', false, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
  end if;
exception when others then
  raise notice 'No se pudo crear el bucket evidencias: %. Créalo a mano (privado).', sqlerrm;
end $$;

-- 4) Crear ruta
create or replace function public.crear_ruta(p_op uuid, p_repartidor uuid, p_nombre text, p_fecha date, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; v_id uuid; v_res jsonb; v_fecha date;
begin
  v_rep := public.iniciar_operacion(p_op, 'crear_ruta', p_actor);
  if v_rep is not null then return v_rep; end if;
  if not exists (select 1 from public.perfiles where user_id = p_repartidor and rol = 'repartidor' and activo) then
    raise exception 'REPARTIDOR_INVALIDO';
  end if;
  if p_nombre is null or char_length(trim(p_nombre)) not between 1 and 60 then raise exception 'NOMBRE_INVALIDO'; end if;
  v_fecha := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  insert into public.rutas (repartidor_id, nombre, fecha, creado_por)
  values (p_repartidor, trim(p_nombre), v_fecha, p_actor) returning id into v_id;
  perform public.reg_bitacora(p_actor, 'ruta_creada', null, null, p_op,
    jsonb_build_object('ruta_id', v_id, 'repartidor_id', p_repartidor, 'fecha', v_fecha, 'nombre', trim(p_nombre)));
  v_res := jsonb_build_object('ruta_id', v_id, 'fecha', v_fecha);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 5) Cargar un documento de venta en una ruta (queda como una parada; la mercancía se carga y se aparta)
create or replace function public.cargar_documento(
  p_op uuid, p_ruta uuid, p_tipo text, p_folio text, p_cliente text, p_lineas jsonb, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_ped uuid; v_folio bigint; v_total numeric(12,2) := 0;
  l record; v_prod record; v_par int; v_res jsonb; v_fd text;
begin
  v_rep := public.iniciar_operacion(p_op, 'cargar_documento', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado <> 'abierta' then raise exception 'RUTA_CERRADA'; end if;
  if p_tipo is null or p_tipo not in ('remision','nota_venta','orden_compra') then raise exception 'TIPO_INVALIDO'; end if;
  v_fd := trim(p_folio);
  if v_fd is null or char_length(v_fd) not between 1 and 40 then raise exception 'FOLIO_INVALIDO'; end if;
  if p_cliente is null or char_length(trim(p_cliente)) not between 1 and 60 then raise exception 'CLIENTE_INVALIDO'; end if;
  if exists (select 1 from public.pedidos where tipo_documento = p_tipo and folio_documento = v_fd) then
    raise exception 'DOCUMENTO_DUPLICADO';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'DOCUMENTO_VACIO';
  end if;

  select coalesce(max(parada), 0) + 1 into v_par from public.pedidos where ruta_id = p_ruta;
  insert into public.pedidos (repartidor_id, cliente_alias, total, estado, ruta_id, tipo_documento, folio_documento, parada)
  values (r.repartidor_id, left(trim(p_cliente), 60), 0.01, 'pendiente', p_ruta, p_tipo, v_fd, v_par)
  returning id, folio into v_ped, v_folio;

  for l in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad')::int as cantidad
           from jsonb_array_elements(p_lineas) x loop
    if l.cantidad is null or l.cantidad <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;
    select * into v_prod from public.productos where id = l.producto_id and activo;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
    values (v_ped, l.producto_id, l.cantidad, v_prod.precio, v_prod.precio * l.cantidad);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'carga', l.cantidad, v_ped, p_actor);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'apartado', l.cantidad, v_ped, p_actor);
    v_total := v_total + v_prod.precio * l.cantidad;
  end loop;

  update public.pedidos set total = v_total where id = v_ped;
  perform public.reg_bitacora(p_actor, 'documento_cargado', v_ped, null, p_op,
    jsonb_build_object('ruta_id', p_ruta, 'tipo', p_tipo, 'folio_documento', v_fd, 'parada', v_par,
                       'total', v_total, 'lineas', jsonb_array_length(p_lineas)));
  v_res := jsonb_build_object('pedido_id', v_ped, 'folio', v_folio, 'parada', v_par,
                              'tipo', p_tipo, 'folio_documento', v_fd, 'total', v_total);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 6) Abrir el cobro de una parada (o reabrirlo si venció)
create or replace function public.abrir_cobro(p_op uuid, p_pedido uuid, p_repartidor uuid, p_vigencia_min int default 15)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; p public.pedidos; c public.cobros; v_vig timestamptz; v_conc text; v_cob uuid;
  v_res jsonb; v_tipo text; v_reabierto boolean := false;
begin
  v_rep := public.iniciar_operacion(p_op, 'abrir_cobro', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  if p_vigencia_min < 6 or p_vigencia_min > 120 then raise exception 'VIGENCIA_INVALIDA'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.repartidor_id <> p_repartidor or p.ruta_id is null then raise exception 'DOCUMENTO_NO_ENCONTRADO'; end if;
  if p.estado <> 'pendiente' then raise exception 'DOCUMENTO_NO_PENDIENTE'; end if;
  v_tipo := case p.tipo_documento when 'remision' then 'Remisión' when 'nota_venta' then 'Nota de venta' else 'Orden de compra' end;
  v_conc := v_tipo || ' ' || p.folio_documento || ' · Empresa Demo';
  v_vig := now() + make_interval(mins => p_vigencia_min);

  select * into c from public.cobros where pedido_id = p.id for update;
  if not found then
    insert into public.cobros (pedido_id, importe, concepto, vigencia_hasta)
    values (p.id, p.total, v_conc, v_vig) returning id into v_cob;
  else
    if c.estado <> 'vencido' then raise exception 'COBRO_NO_REABRIBLE'; end if;
    update public.cobros set estado = 'emitido', vigencia_hasta = v_vig, reabierto_en = now(), actualizado_en = now()
    where id = c.id;
    v_cob := c.id; v_reabierto := true;
  end if;
  update public.pedidos set estado = 'por_cobrar', actualizado_en = now() where id = p.id;
  perform public.reg_bitacora(p_repartidor::text, 'cobro_abierto', p.id, v_cob, p_op,
    jsonb_build_object('importe', p.total, 'reabierto', v_reabierto));
  v_res := jsonb_build_object('pedido_id', p.id, 'folio', p.folio, 'cobro_id', v_cob,
                              'importe', p.total, 'concepto', v_conc, 'vigencia_hasta', v_vig, 'reabierto', v_reabierto);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 7) Crear intento: un solo QR vivo a la vez; cinco intentos por cada apertura del cobro
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
  select count(*) into v_n from public.intentos_pago
   where cobro_id = p_cobro and creado_en >= coalesce(c.reabierto_en, c.creado_en);
  if v_n >= 5 then raise exception 'LIMITE_DE_INTENTOS'; end if;
  if exists (select 1 from public.intentos_pago
             where cobro_id = p_cobro and estado = 'creado'
               and expira_en + interval '30 seconds' > now()) then
    raise exception 'INTENTO_VIGENTE';
  end if;

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

-- 8) Entrega con evidencia (foto y firma, o excepción con motivo que queda para revisión)
drop function if exists public.marcar_entregado(uuid, uuid, uuid);
create or replace function public.marcar_entregado(
  p_op uuid, p_pedido uuid, p_repartidor uuid,
  p_recibe text default null,
  p_foto_ruta text default null, p_foto_hash text default null,
  p_firma_ruta text default null, p_firma_hash text default null,
  p_excepcion text default null, p_nota text default null,
  p_latitud numeric default null, p_longitud numeric default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; p public.pedidos; v_res jsonb; v_cob uuid;
begin
  v_rep := public.iniciar_operacion(p_op, 'marcar_entregado', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.repartidor_id <> p_repartidor then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  if p.estado <> 'pagado' then raise exception 'PEDIDO_NO_PAGADO'; end if;
  if p_recibe is null or char_length(trim(p_recibe)) not between 1 and 80 then
    raise exception 'EVIDENCIA_INCOMPLETA: quien recibe';
  end if;
  if p_excepcion is null then
    if p_foto_ruta is null or p_foto_hash is null or p_firma_ruta is null or p_firma_hash is null then
      raise exception 'EVIDENCIA_INCOMPLETA: foto y firma';
    end if;
  else
    if p_excepcion not in ('recibio_tercero','cliente_no_firma','sin_foto') then raise exception 'EXCEPCION_INVALIDA'; end if;
    if p_nota is null or char_length(trim(p_nota)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  end if;

  insert into public.entregas_evidencia (pedido_id, recibe_nombre, foto_ruta, foto_hash, firma_ruta, firma_hash,
    excepcion, nota, latitud, longitud, requiere_revision, capturada_por)
  values (p.id, trim(p_recibe), p_foto_ruta, p_foto_hash, p_firma_ruta, p_firma_hash,
    p_excepcion, p_nota, p_latitud, p_longitud, p_excepcion is not null, p_repartidor::text);

  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select p.repartidor_id, l.producto_id, 'salida', l.cantidad, p.id, p_repartidor::text
  from public.pedido_lineas l where l.pedido_id = p.id;
  update public.pedidos set estado = 'entregado', actualizado_en = now() where id = p.id;
  select id into v_cob from public.cobros where pedido_id = p.id;
  perform public.reg_bitacora(p_repartidor::text, 'pedido_entregado', p.id, v_cob, p_op,
    jsonb_build_object('excepcion', p_excepcion, 'foto_hash', p_foto_hash, 'firma_hash', p_firma_hash,
                       'con_ubicacion', p_latitud is not null and p_longitud is not null));
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'entregado', 'requiere_revision', p_excepcion is not null);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 9) El administrador revisa una entrega con excepción
create or replace function public.revisar_entrega(p_op uuid, p_pedido uuid, p_nota text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; e public.entregas_evidencia; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'revisar_entrega', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_nota is null or char_length(trim(p_nota)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  select * into e from public.entregas_evidencia where pedido_id = p_pedido for update;
  if not found then raise exception 'ENTREGA_NO_ENCONTRADA'; end if;
  if not e.requiere_revision or e.revisada_en is not null then raise exception 'ENTREGA_SIN_REVISION_PENDIENTE'; end if;
  update public.entregas_evidencia set revisada_por = p_actor, revisada_en = now(), nota_revision = trim(p_nota)
  where id = e.id;
  perform public.reg_bitacora(p_actor, 'entrega_revisada', p_pedido, null, p_op,
    jsonb_build_object('excepcion', e.excepcion, 'nota', left(trim(p_nota), 300)));
  v_res := jsonb_build_object('pedido_id', p_pedido, 'revisada', true);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 10) Devolver un documento que no se pudo cobrar ni entregar: la mercancía regresa al almacén
create or replace function public.devolver_documento(p_op uuid, p_pedido uuid, p_motivo text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; p public.pedidos; v_cob uuid; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'devolver_documento', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then raise exception 'MOTIVO_OBLIGATORIO'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.ruta_id is null then raise exception 'DOCUMENTO_NO_ENCONTRADO'; end if;
  if p.estado not in ('pendiente','por_cobrar') then raise exception 'DOCUMENTO_NO_DEVOLVIBLE'; end if;
  update public.cobros set estado = 'cancelado', actualizado_en = now()
   where pedido_id = p.id and estado <> 'pagado' returning id into v_cob;
  if v_cob is not null then
    update public.intentos_pago set estado = 'expirado' where cobro_id = v_cob and estado = 'creado';
  end if;
  perform public.liberar_pedido(p.id, p_actor);
  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select p.repartidor_id, l.producto_id, 'ajuste', -l.cantidad, p.id, p_actor
  from public.pedido_lineas l where l.pedido_id = p.id;
  update public.pedidos set estado = 'devuelto', actualizado_en = now() where id = p.id;
  perform public.reg_bitacora(p_actor, 'documento_devuelto', p.id, v_cob, p_op,
    jsonb_build_object('motivo', left(trim(p_motivo), 300)));
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'devuelto');
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 11) Cerrar la ruta: solo si todas las paradas terminaron
create or replace function public.cerrar_ruta(p_op uuid, p_ruta uuid, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; r public.rutas; v_n int; v_ent int; v_dev int; v_cobrado numeric(12,2); v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'cerrar_ruta', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado = 'cerrada' then raise exception 'RUTA_YA_CERRADA'; end if;
  select count(*) into v_n from public.pedidos
   where ruta_id = p_ruta and estado not in ('entregado','devuelto','cancelado');
  if v_n > 0 then raise exception 'RUTA_CON_PENDIENTES: %', v_n; end if;
  select count(*) filter (where estado = 'entregado'), count(*) filter (where estado = 'devuelto'),
         coalesce(sum(total) filter (where estado = 'entregado'), 0)
    into v_ent, v_dev, v_cobrado from public.pedidos where ruta_id = p_ruta;
  update public.rutas set estado = 'cerrada', cerrada_en = now() where id = p_ruta;
  perform public.reg_bitacora(p_actor, 'ruta_cerrada', null, null, p_op,
    jsonb_build_object('ruta_id', p_ruta, 'entregados', v_ent, 'devueltos', v_dev, 'cobrado', v_cobrado));
  v_res := jsonb_build_object('ruta_id', p_ruta, 'entregados', v_ent, 'devueltos', v_dev, 'cobrado', v_cobrado);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 12) Vencimiento: en una ruta, el documento vuelve a pendiente (la mercancía sigue en la camioneta)
create or replace function public.expirar_vencidos()
returns jsonb language plpgsql as $$
declare r record; v_i int; v_c int := 0;
begin
  update public.intentos_pago set estado = 'expirado'
  where estado = 'creado' and expira_en + interval '30 seconds' < now();
  get diagnostics v_i = row_count;
  for r in
    select c.id as cobro_id, c.pedido_id, p.ruta_id
    from public.cobros c join public.pedidos p on p.id = c.pedido_id
    where c.estado in ('emitido','en_proceso') and c.vigencia_hasta < now()
      and not exists (select 1 from public.intentos_pago i where i.cobro_id = c.id and i.estado = 'creado')
    for update of c skip locked
  loop
    update public.cobros set estado = 'vencido', actualizado_en = now() where id = r.cobro_id;
    if r.ruta_id is null then
      update public.pedidos set estado = 'cancelado', actualizado_en = now() where id = r.pedido_id;
      perform public.liberar_pedido(r.pedido_id, 'sistema');
    else
      update public.pedidos set estado = 'pendiente', actualizado_en = now() where id = r.pedido_id;
    end if;
    perform public.reg_bitacora('sistema', 'cobro_vencido', r.pedido_id, r.cobro_id, null,
      jsonb_build_object('vuelve_a_pendiente', r.ruta_id is not null));
    v_c := v_c + 1;
  end loop;
  return jsonb_build_object('intentos_expirados', v_i, 'cobros_vencidos', v_c);
end $$;

-- 13) Cancelar: un documento de ruta no se cancela, se devuelve
create or replace function public.cancelar_pedido(p_op uuid, p_pedido uuid, p_actor text)
returns jsonb language plpgsql as $$
declare v_rep jsonb; p public.pedidos; v_cob uuid; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'cancelar_pedido', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  if p.ruta_id is not null then raise exception 'USAR_DEVOLUCION'; end if;
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

-- 14) Verificación de integridad (suma dos reglas: documentos pendientes/devueltos y entregas con evidencia)
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
  where (q.estado in ('pendiente','por_cobrar','pagado') and q.apartado_vivo <> q.lineas)
     or (q.estado in ('entregado','cancelado','devuelto') and q.apartado_vivo <> 0);
  prueba := 'Stock apartado coincide con los pedidos vivos'; ok := v_n = 0; detalle := v_n || ' pedidos con diferencia';
  return next;

  select count(*) into v_n from public.pedidos p
  where p.ruta_id is not null and p.estado = 'entregado'
    and not exists (select 1 from public.entregas_evidencia e where e.pedido_id = p.id);
  prueba := 'Entregas de ruta con evidencia'; ok := v_n = 0; detalle := v_n || ' entregas sin evidencia';
  return next;
end $$;

-- Permisos: solo el rol de servicio ejecuta la lógica
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
```

### Bloque 2e · reorden de paradas y orden de compra de origen

SQL original aplicado en producción. El repartidor reordena solo las paradas pendientes o por cobrar, con motivo, y la bitácora guarda el orden de antes y de después (folios). Las paradas ya pagadas, entregadas o devueltas conservan su lugar. Archivo: `supabase/sql/02e-reorden-paradas-orden-compra.sql`.

```sql
-- FASE 2b · El repartidor reordena sus paradas (con motivo y aviso a administración) y la remisión guarda su orden de compra de origen

alter table public.pedidos
  add column if not exists orden_compra_ref text
  check (orden_compra_ref is null or char_length(orden_compra_ref) between 1 and 40);

-- cargar_documento ahora acepta la orden de compra de origen (opcional, al final)
drop function if exists public.cargar_documento(uuid, uuid, text, text, text, jsonb, text);
create or replace function public.cargar_documento(
  p_op uuid, p_ruta uuid, p_tipo text, p_folio text, p_cliente text, p_lineas jsonb, p_actor text,
  p_orden_compra text default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_ped uuid; v_folio bigint; v_total numeric(12,2) := 0;
  l record; v_prod record; v_par int; v_res jsonb; v_fd text; v_oc text;
begin
  v_rep := public.iniciar_operacion(p_op, 'cargar_documento', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado <> 'abierta' then raise exception 'RUTA_CERRADA'; end if;
  if p_tipo is null or p_tipo not in ('remision','nota_venta','orden_compra') then raise exception 'TIPO_INVALIDO'; end if;
  v_fd := trim(p_folio);
  if v_fd is null or char_length(v_fd) not between 1 and 40 then raise exception 'FOLIO_INVALIDO'; end if;
  if p_cliente is null or char_length(trim(p_cliente)) not between 1 and 60 then raise exception 'CLIENTE_INVALIDO'; end if;
  v_oc := nullif(trim(coalesce(p_orden_compra, '')), '');
  if v_oc is not null and char_length(v_oc) > 40 then raise exception 'ORDEN_COMPRA_INVALIDA'; end if;
  if exists (select 1 from public.pedidos where tipo_documento = p_tipo and folio_documento = v_fd) then
    raise exception 'DOCUMENTO_DUPLICADO';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'DOCUMENTO_VACIO';
  end if;

  select coalesce(max(parada), 0) + 1 into v_par from public.pedidos where ruta_id = p_ruta;
  insert into public.pedidos (repartidor_id, cliente_alias, total, estado, ruta_id, tipo_documento, folio_documento, parada, orden_compra_ref)
  values (r.repartidor_id, left(trim(p_cliente), 60), 0.01, 'pendiente', p_ruta, p_tipo, v_fd, v_par, v_oc)
  returning id, folio into v_ped, v_folio;

  for l in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad')::int as cantidad
           from jsonb_array_elements(p_lineas) x loop
    if l.cantidad is null or l.cantidad <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;
    select * into v_prod from public.productos where id = l.producto_id and activo;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
    values (v_ped, l.producto_id, l.cantidad, v_prod.precio, v_prod.precio * l.cantidad);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'carga', l.cantidad, v_ped, p_actor);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'apartado', l.cantidad, v_ped, p_actor);
    v_total := v_total + v_prod.precio * l.cantidad;
  end loop;

  update public.pedidos set total = v_total where id = v_ped;
  perform public.reg_bitacora(p_actor, 'documento_cargado', v_ped, null, p_op,
    jsonb_build_object('ruta_id', p_ruta, 'tipo', p_tipo, 'folio_documento', v_fd, 'parada', v_par,
                       'total', v_total, 'lineas', jsonb_array_length(p_lineas), 'orden_compra', v_oc));
  v_res := jsonb_build_object('pedido_id', v_ped, 'folio', v_folio, 'parada', v_par,
                              'tipo', p_tipo, 'folio_documento', v_fd, 'total', v_total, 'orden_compra', v_oc);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- Reordenar paradas: solo las que siguen pendientes o por cobrar; las ya pagadas, entregadas o devueltas conservan su lugar
create or replace function public.reordenar_paradas(
  p_op uuid, p_ruta uuid, p_repartidor uuid, p_orden uuid[], p_motivo text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_mov uuid[]; v_slots int[]; v_antes jsonb; v_despues jsonb; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'reordenar_paradas', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found or r.repartidor_id <> p_repartidor then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado <> 'abierta' then raise exception 'RUTA_CERRADA'; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then raise exception 'MOTIVO_OBLIGATORIO'; end if;

  select array_agg(id order by parada), array_agg(parada order by parada)
    into v_mov, v_slots
  from public.pedidos where ruta_id = p_ruta and estado in ('pendiente','por_cobrar');
  if v_mov is null then raise exception 'SIN_PARADAS_MOVIBLES'; end if;
  if p_orden is null or cardinality(p_orden) <> cardinality(v_mov)
     or (select count(distinct x) from unnest(p_orden) x) <> cardinality(v_mov)
     or exists (select 1 from unnest(p_orden) x where x <> all (v_mov)) then
    raise exception 'ORDEN_INVALIDO';
  end if;
  if p_orden = v_mov then raise exception 'SIN_CAMBIOS'; end if;

  select jsonb_agg(p.folio_documento order by p.parada) into v_antes
    from public.pedidos p where p.id = any (v_mov);

  update public.pedidos p set parada = v_slots[o.n], actualizado_en = now()
  from unnest(p_orden) with ordinality as o(id, n)
  where p.id = o.id;

  select jsonb_agg(p.folio_documento order by p.parada) into v_despues
    from public.pedidos p where p.id = any (v_mov);

  perform public.reg_bitacora(p_repartidor::text, 'ruta_reordenada', null, null, p_op,
    jsonb_build_object('ruta_id', p_ruta, 'antes', v_antes, 'despues', v_despues, 'motivo', left(trim(p_motivo), 300)));
  v_res := jsonb_build_object('ruta_id', p_ruta, 'antes', v_antes, 'despues', v_despues);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
```

### Bloque 3 · datos de demostración

Corra **después** de crear los tres usuarios en Authentication.

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

### Ruta de demostración (opcional)

Después de los bloques 2d y 3, `supabase/sql/datos-demo-ruta.sql` crea la «Ruta Demo Centro» de hoy para Repartidor Uno, con tres documentos inventados. Se puede correr una sola vez por día.

## Cómo correr las pruebas

Solo contra Postgres 16 **local**. Nunca contra un proyecto en la nube. Las pruebas borran y recrean la base `poch_pruebas` y se niegan a correr si `PGHOST` o `DATABASE_URL` apuntan a Supabase. Si ya tiene otro Postgres en el puerto 5432, use otro puerto con `PGPORT`, y `PGHOST` y `PGUSER` según su instalación.

```bash
npm install
npm test
```

El juego de pruebas crea la base `poch_pruebas`, aplica las migraciones y corre firma, extracción de payload y las doce situaciones. El simulador:

```bash
npm run simular-webhook -- http://127.0.0.1:54321/functions/v1/webhook-pey
```

Si `PEY_WEBHOOK_SECRET` no está, usa el secreto local de prueba y lo dice en pantalla. **Es simulación; no es un pago real.**

## Desarrollo local de la interfaz

```bash
npm install
npm run dev
```

Sin las variables `VITE_*` la pantalla de ingreso lo indica. El comprobante público del cliente vive en `/c/:clave`. La guía de estilo, sin sesión, vive en `/estilo`.

## Siguiente fase (fuera de esta corrida)

Disputas con evidencia, devoluciones por API, pago con tarjeta o liga, carga de stock desde la interfaz, facturación fiscal, notificaciones por correo y aplicación nativa.

## Documentación

- [`docs/BITACORA-DE-DESARROLLO.md`](docs/BITACORA-DE-DESARROLLO.md)
- [`docs/PEY-VERIFICADO.md`](docs/PEY-VERIFICADO.md)
- [`docs/cuaderno-de-datos.md`](docs/cuaderno-de-datos.md)
- [`docs/GUION-DEMO.md`](docs/GUION-DEMO.md)
- [`docs/PROMPT-CONSTRUCCION.md`](docs/PROMPT-CONSTRUCCION.md)
- [`docs/diseno/poch-ruta.html`](docs/diseno/poch-ruta.html)
- [`CLAUDE.md`](CLAUDE.md)

## Equipo y método

Desarrollo de Yoltik con Git Flow simplificado: `main` solo con lo que funciona, `develop` para integrar y `feature/*` para cada pieza. El front oscuro de la ruta está en `revision/code`. `main` se actualiza cuando Polo lo pide.
