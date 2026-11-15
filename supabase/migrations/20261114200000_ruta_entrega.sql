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
