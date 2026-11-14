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
