-- FASE 2 · Ruta de entrega, documentos de venta y evidencia (foto + firma)
-- AVISO AL EQUIPO: Polo indicó que esta migración ya estaba escrita y probada, pero no la
-- pegó en el chat. Esta versión se armó a partir del prompt §1 (firmas, errores y reglas).
-- Si Polo tiene el SQL original, debe sustituir este archivo tal cual y reportar diferencias.
-- No se modifican las migraciones anteriores.

-- 1) Rutas del día
create table public.rutas (
  id uuid primary key default gen_random_uuid(),
  repartidor_id uuid not null references public.perfiles(user_id),
  nombre text not null check (char_length(trim(nombre)) between 1 and 80),
  fecha date not null,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  creado_por text not null,
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  cerrado_por text
);

create index on public.rutas (repartidor_id, fecha, estado);

-- 2) Documentos de venta como pedidos de ruta
alter table public.pedidos
  add column if not exists ruta_id uuid references public.rutas(id),
  add column if not exists tipo_documento text,
  add column if not exists folio_documento text,
  add column if not exists parada int;

alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente','por_cobrar','pagado','entregado','devuelto','cancelado'));

alter table public.pedidos drop constraint if exists pedidos_tipo_documento_check;
alter table public.pedidos add constraint pedidos_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('remision','nota_venta','orden_compra'));

create unique index if not exists un_documento_en_ruta
  on public.pedidos (ruta_id, tipo_documento, folio_documento)
  where ruta_id is not null;

create index if not exists idx_pedidos_ruta_parada on public.pedidos (ruta_id, parada);

-- Cobro: marca de la última apertura (para contar 5 intentos desde ahí)
alter table public.cobros
  add column if not exists abierto_en timestamptz;

update public.cobros set abierto_en = creado_en where abierto_en is null;
alter table public.cobros alter column abierto_en set default now();

-- 3) Evidencia de entrega (solo agregar)
create table public.entregas_evidencia (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id),
  recibe_nombre text not null check (char_length(trim(recibe_nombre)) between 1 and 80),
  foto_ruta text,
  foto_hash text,
  firma_ruta text,
  firma_hash text,
  excepcion text check (excepcion is null or excepcion in ('recibio_tercero','cliente_no_firma','sin_foto')),
  nota text,
  latitud numeric(9,6),
  longitud numeric(9,6),
  requiere_revision boolean not null default false,
  revisada boolean not null default false,
  revisada_por text,
  revisada_en timestamptz,
  nota_revision text,
  entregado_en timestamptz not null default now()
);

create trigger evidencia_no_modificar before update or delete on public.entregas_evidencia
for each row execute function public.solo_agregar();
create trigger evidencia_no_vaciar before truncate on public.entregas_evidencia
for each statement execute function public.solo_agregar();

-- Excepción: permitir solo la revisión administrativa (revisada / nota_revision)
create or replace function public.entregas_evidencia_solo_revision()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La tabla % solo admite agregar filas', tg_table_name;
  end if;
  if old.pedido_id is distinct from new.pedido_id
     or old.recibe_nombre is distinct from new.recibe_nombre
     or old.foto_ruta is distinct from new.foto_ruta
     or old.foto_hash is distinct from new.foto_hash
     or old.firma_ruta is distinct from new.firma_ruta
     or old.firma_hash is distinct from new.firma_hash
     or old.excepcion is distinct from new.excepcion
     or old.nota is distinct from new.nota
     or old.latitud is distinct from new.latitud
     or old.longitud is distinct from new.longitud
     or old.entregado_en is distinct from new.entregado_en
     or old.requiere_revision is distinct from new.requiere_revision then
    raise exception 'La evidencia de entrega no se puede alterar';
  end if;
  return new;
end $$;

drop trigger if exists evidencia_no_modificar on public.entregas_evidencia;
create trigger evidencia_no_modificar before update or delete on public.entregas_evidencia
for each row execute function public.entregas_evidencia_solo_revision();

alter table public.rutas enable row level security;
alter table public.entregas_evidencia enable row level security;
revoke all on public.rutas from anon, authenticated;
revoke all on public.entregas_evidencia from anon, authenticated;
grant all on public.rutas to service_role;
grant all on public.entregas_evidencia to service_role;

-- 4) crear_ruta
create or replace function public.crear_ruta(
  p_op uuid, p_repartidor uuid, p_nombre text, p_fecha date, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; v_id uuid; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'crear_ruta', p_actor);
  if v_rep is not null then return v_rep; end if;
  if not exists (select 1 from public.perfiles where user_id = p_repartidor and rol = 'repartidor' and activo) then
    raise exception 'REPARTIDOR_INVALIDO';
  end if;
  if p_nombre is null or char_length(trim(p_nombre)) < 1 then raise exception 'NOMBRE_INVALIDO'; end if;
  if p_fecha is null then raise exception 'FECHA_INVALIDA'; end if;

  insert into public.rutas (repartidor_id, nombre, fecha, creado_por)
  values (p_repartidor, left(trim(p_nombre), 80), p_fecha, p_actor)
  returning id into v_id;

  perform public.reg_bitacora(p_actor, 'ruta_creada', null, null, p_op,
    jsonb_build_object('ruta_id', v_id, 'repartidor_id', p_repartidor, 'fecha', p_fecha));
  v_res := jsonb_build_object('ruta_id', v_id, 'fecha', p_fecha);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 5) cargar_documento: suma existencia (carga) y aparta para la parada
create or replace function public.cargar_documento(
  p_op uuid, p_ruta uuid, p_tipo text, p_folio text, p_cliente text, p_lineas jsonb, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_ped uuid; v_folio bigint; v_parada int; v_total numeric(12,2) := 0;
  l record; v_prod record; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'cargar_documento', p_actor);
  if v_rep is not null then return v_rep; end if;

  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado <> 'abierta' then raise exception 'RUTA_CERRADA'; end if;
  if p_tipo is null or p_tipo not in ('remision','nota_venta','orden_compra') then raise exception 'TIPO_INVALIDO'; end if;
  if p_folio is null or char_length(trim(p_folio)) < 1 or char_length(trim(p_folio)) > 40 then raise exception 'FOLIO_INVALIDO'; end if;
  if p_cliente is null or char_length(trim(p_cliente)) < 1 then raise exception 'CLIENTE_INVALIDO'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'DOCUMENTO_VACIO';
  end if;
  if exists (
    select 1 from public.pedidos
    where ruta_id = p_ruta and tipo_documento = p_tipo and folio_documento = trim(p_folio)
  ) then raise exception 'DOCUMENTO_DUPLICADO'; end if;

  select coalesce(max(parada), 0) + 1 into v_parada from public.pedidos where ruta_id = p_ruta;

  perform pg_advisory_xact_lock(hashtext(r.repartidor_id::text));

  insert into public.pedidos (repartidor_id, cliente_alias, total, estado, ruta_id, tipo_documento, folio_documento, parada)
  values (r.repartidor_id, left(trim(p_cliente), 60), 0.01, 'pendiente', p_ruta, p_tipo, trim(p_folio), v_parada)
  returning id, folio into v_ped, v_folio;

  for l in select (x->>'producto_id')::uuid as producto_id, (x->>'cantidad')::int as cantidad
           from jsonb_array_elements(p_lineas) x loop
    if l.cantidad is null or l.cantidad <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;
    select * into v_prod from public.productos where id = l.producto_id and activo;
    if not found then raise exception 'PRODUCTO_INVALIDO'; end if;
    insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
    values (v_ped, l.producto_id, l.cantidad, v_prod.precio, v_prod.precio * l.cantidad);
    -- La carga suma existencia; el apartado reserva la parada. SIN_EXISTENCIA no aplica.
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'carga', l.cantidad, v_ped, p_actor);
    insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
    values (r.repartidor_id, l.producto_id, 'apartado', l.cantidad, v_ped, p_actor);
    v_total := v_total + v_prod.precio * l.cantidad;
  end loop;

  update public.pedidos set total = v_total where id = v_ped;
  perform public.reg_bitacora(p_actor, 'documento_cargado', v_ped, null, p_op,
    jsonb_build_object('ruta_id', p_ruta, 'tipo', p_tipo, 'folio_documento', trim(p_folio),
                       'parada', v_parada, 'total', v_total));
  v_res := jsonb_build_object('pedido_id', v_ped, 'folio', v_folio, 'parada', v_parada,
                              'tipo', p_tipo, 'folio_documento', trim(p_folio), 'total', v_total);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 6) abrir_cobro: de pendiente (o vencido reabrible) a por_cobrar
create or replace function public.abrir_cobro(
  p_op uuid, p_pedido uuid, p_repartidor uuid, p_vigencia_min int default 15)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; p public.pedidos; c public.cobros; v_cob uuid; v_vig timestamptz; v_conc text; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'abrir_cobro', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  if p_vigencia_min < 6 or p_vigencia_min > 120 then raise exception 'VIGENCIA_INVALIDA'; end if;

  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.repartidor_id <> p_repartidor then raise exception 'DOCUMENTO_NO_ENCONTRADO'; end if;
  if p.estado not in ('pendiente','por_cobrar') then raise exception 'DOCUMENTO_NO_PENDIENTE'; end if;

  select * into c from public.cobros where pedido_id = p.id for update;
  v_vig := now() + make_interval(mins => p_vigencia_min);
  v_conc := coalesce(p.tipo_documento, 'pedido') || ' ' || coalesce(p.folio_documento, p.folio::text)
            || ' · ' || p.cliente_alias;

  if c.id is null then
    insert into public.cobros (pedido_id, importe, concepto, vigencia_hasta, estado, abierto_en)
    values (p.id, p.total, v_conc, v_vig, 'emitido', now())
    returning id into v_cob;
  else
    if c.estado = 'pagado' then raise exception 'COBRO_YA_PAGADO'; end if;
    if c.estado = 'cancelado' then raise exception 'COBRO_NO_REABRIBLE'; end if;
    if c.estado in ('emitido','en_proceso') and c.vigencia_hasta > now() then
      v_cob := c.id;
    elsif c.estado in ('vencido') or c.vigencia_hasta <= now() then
      update public.cobros
        set estado = 'emitido', vigencia_hasta = v_vig, abierto_en = now(),
            concepto = v_conc, actualizado_en = now()
      where id = c.id;
      update public.intentos_pago set estado = 'expirado' where cobro_id = c.id and estado = 'creado';
      v_cob := c.id;
    else
      raise exception 'COBRO_NO_REABRIBLE';
    end if;
  end if;

  update public.pedidos set estado = 'por_cobrar', actualizado_en = now() where id = p.id;
  perform public.reg_bitacora(p_repartidor::text, 'cobro_abierto', p.id, v_cob, p_op,
    jsonb_build_object('vigencia_hasta', v_vig));
  v_res := jsonb_build_object('pedido_id', p.id, 'cobro_id', v_cob, 'importe', p.total,
                              'concepto', v_conc, 'vigencia_hasta', v_vig);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 7) crear_intento: 5 desde la última apertura; INTENTO_VIGENTE si el QR sigue vivo (+30 s)
create or replace function public.crear_intento(p_op uuid, p_cobro uuid, p_metodo text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; c public.cobros; v_int uuid; v_ref text; v_exp timestamptz; v_n int; v_res jsonb;
  v_vivo record; v_seg int;
begin
  v_rep := public.iniciar_operacion(p_op, 'crear_intento', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_metodo not in ('qr','push') then raise exception 'METODO_INVALIDO'; end if;

  select * into c from public.cobros where id = p_cobro for update;
  if not found then raise exception 'COBRO_NO_ENCONTRADO'; end if;
  if c.estado = 'pagado' then raise exception 'COBRO_YA_PAGADO'; end if;
  if c.estado in ('vencido','cancelado') or c.vigencia_hasta <= now() then raise exception 'COBRO_NO_VIGENTE'; end if;

  select * into v_vivo from public.intentos_pago
  where cobro_id = p_cobro and estado = 'creado' and expira_en + interval '30 seconds' > now()
  order by creado_en desc limit 1;
  if found then
    v_seg := greatest(1, ceil(extract(epoch from (v_vivo.expira_en + interval '30 seconds' - now()))));
    raise exception 'INTENTO_VIGENTE:%', v_seg;
  end if;

  select count(*) into v_n from public.intentos_pago
  where cobro_id = p_cobro and creado_en >= coalesce(c.abierto_en, c.creado_en);
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

-- 8) marcar_entregado con evidencia
drop function if exists public.marcar_entregado(uuid, uuid, uuid);
create or replace function public.marcar_entregado(
  p_op uuid, p_pedido uuid, p_repartidor uuid,
  p_recibe text, p_foto_ruta text, p_foto_hash text,
  p_firma_ruta text, p_firma_hash text,
  p_excepcion text default null, p_nota text default null,
  p_latitud numeric default null, p_longitud numeric default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; p public.pedidos; v_res jsonb; v_cob uuid; v_rev boolean := false;
begin
  v_rep := public.iniciar_operacion(p_op, 'marcar_entregado', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found or p.repartidor_id <> p_repartidor then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  if p.estado <> 'pagado' then raise exception 'PEDIDO_NO_PAGADO'; end if;
  if p_recibe is null or char_length(trim(p_recibe)) < 1 then raise exception 'EVIDENCIA_INCOMPLETA'; end if;

  if p_excepcion is null then
    if p_foto_ruta is null or p_foto_hash is null or p_firma_ruta is null or p_firma_hash is null then
      raise exception 'EVIDENCIA_INCOMPLETA';
    end if;
  else
    if p_excepcion not in ('recibio_tercero','cliente_no_firma','sin_foto') then
      raise exception 'EXCEPCION_INVALIDA';
    end if;
    if p_nota is null or char_length(trim(p_nota)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
    v_rev := true;
    if p_excepcion = 'sin_foto' and (p_firma_ruta is null or p_firma_hash is null) then
      raise exception 'EVIDENCIA_INCOMPLETA';
    end if;
    if p_excepcion = 'cliente_no_firma' and (p_foto_ruta is null or p_foto_hash is null) then
      raise exception 'EVIDENCIA_INCOMPLETA';
    end if;
  end if;

  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select p.repartidor_id, l.producto_id, 'salida', l.cantidad, p.id, p_repartidor::text
  from public.pedido_lineas l where l.pedido_id = p.id;
  update public.pedidos set estado = 'entregado', actualizado_en = now() where id = p.id;
  select id into v_cob from public.cobros where pedido_id = p.id;

  insert into public.entregas_evidencia (
    pedido_id, recibe_nombre, foto_ruta, foto_hash, firma_ruta, firma_hash,
    excepcion, nota, latitud, longitud, requiere_revision)
  values (
    p.id, left(trim(p_recibe), 80), p_foto_ruta, p_foto_hash, p_firma_ruta, p_firma_hash,
    p_excepcion, case when p_nota is null then null else left(trim(p_nota), 300) end,
    p_latitud, p_longitud, v_rev);

  perform public.reg_bitacora(p_repartidor::text, 'pedido_entregado', p.id, v_cob, p_op,
    jsonb_build_object('excepcion', p_excepcion, 'requiere_revision', v_rev));
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'entregado', 'requiere_revision', v_rev);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 9) revisar_entrega (admin)
create or replace function public.revisar_entrega(p_op uuid, p_pedido uuid, p_nota text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; e public.entregas_evidencia; v_res jsonb; v_cob uuid;
begin
  v_rep := public.iniciar_operacion(p_op, 'revisar_entrega', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_nota is null or char_length(trim(p_nota)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  select * into e from public.entregas_evidencia where pedido_id = p_pedido for update;
  if not found then raise exception 'ENTREGA_NO_ENCONTRADA'; end if;
  if e.revisada then
    v_res := jsonb_build_object('pedido_id', p_pedido, 'revisada', true);
    update public.operaciones set resultado = v_res where operacion_id = p_op;
    return coalesce((select resultado from public.operaciones where operacion_id = p_op), v_res);
  end if;
  update public.entregas_evidencia
    set revisada = true, revisada_por = p_actor, revisada_en = now(),
        nota_revision = left(trim(p_nota), 300)
  where pedido_id = p_pedido;
  select id into v_cob from public.cobros where pedido_id = p_pedido;
  perform public.reg_bitacora(p_actor, 'entrega_revisada', p_pedido, v_cob, p_op,
    jsonb_build_object('nota', left(trim(p_nota), 300)));
  v_res := jsonb_build_object('pedido_id', p_pedido, 'revisada', true);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 10) devolver_documento
create or replace function public.devolver_documento(p_op uuid, p_pedido uuid, p_motivo text, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; p public.pedidos; v_cob uuid; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'devolver_documento', p_actor);
  if v_rep is not null then return v_rep; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'DOCUMENTO_NO_ENCONTRADO'; end if;
  if p.estado not in ('pendiente','por_cobrar') then raise exception 'DOCUMENTO_NO_DEVOLVIBLE'; end if;

  update public.cobros set estado = 'cancelado', actualizado_en = now()
    where pedido_id = p.id and estado in ('emitido','en_proceso','vencido')
    returning id into v_cob;
  if v_cob is not null then
    update public.intentos_pago set estado = 'expirado' where cobro_id = v_cob and estado = 'creado';
  end if;
  update public.pedidos set estado = 'devuelto', actualizado_en = now() where id = p.id;
  perform public.liberar_pedido(p.id, p_actor);
  -- Regresa mercancía: quita la carga asociada al documento
  insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, pedido_id, actor)
  select p.repartidor_id, l.producto_id, 'ajuste', -l.cantidad, p.id, p_actor
  from public.pedido_lineas l where l.pedido_id = p.id;

  perform public.reg_bitacora(p_actor, 'documento_devuelto', p.id, v_cob, p_op,
    jsonb_build_object('motivo', left(trim(p_motivo), 300)));
  v_res := jsonb_build_object('pedido_id', p.id, 'estado', 'devuelto');
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 11) cerrar_ruta
create or replace function public.cerrar_ruta(p_op uuid, p_ruta uuid, p_actor text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare v_rep jsonb; r public.rutas; v_pend int; v_res jsonb;
begin
  v_rep := public.iniciar_operacion(p_op, 'cerrar_ruta', p_actor);
  if v_rep is not null then return v_rep; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado = 'cerrada' then
    v_res := jsonb_build_object('ruta_id', p_ruta, 'estado', 'cerrada');
    update public.operaciones set resultado = v_res where operacion_id = p_op;
    return v_res;
  end if;
  select count(*) into v_pend from public.pedidos
  where ruta_id = p_ruta and estado in ('pendiente','por_cobrar','pagado');
  if v_pend > 0 then raise exception 'RUTA_CON_PENDIENTES'; end if;
  update public.rutas set estado = 'cerrada', cerrado_en = now(), cerrado_por = p_actor where id = p_ruta;
  perform public.reg_bitacora(p_actor, 'ruta_cerrada', null, null, p_op, jsonb_build_object('ruta_id', p_ruta));
  v_res := jsonb_build_object('ruta_id', p_ruta, 'estado', 'cerrada');
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- 12) expirar_vencidos: en ruta el documento vuelve a pendiente
create or replace function public.expirar_vencidos()
returns jsonb language plpgsql as $$
declare r record; v_i int; v_c int := 0;
begin
  update public.intentos_pago set estado = 'expirado'
  where estado = 'creado' and expira_en + interval '30 seconds' < now();
  get diagnostics v_i = row_count;
  for r in
    select c.id as cobro_id, c.pedido_id, p.ruta_id
    from public.cobros c
    join public.pedidos p on p.id = c.pedido_id
    where c.estado in ('emitido','en_proceso') and c.vigencia_hasta < now()
      and not exists (select 1 from public.intentos_pago i where i.cobro_id = c.id and i.estado = 'creado')
    for update of c skip locked
  loop
    update public.cobros set estado = 'vencido', actualizado_en = now() where id = r.cobro_id;
    if r.ruta_id is not null then
      update public.pedidos set estado = 'pendiente', actualizado_en = now() where id = r.pedido_id;
    else
      update public.pedidos set estado = 'cancelado', actualizado_en = now() where id = r.pedido_id;
      perform public.liberar_pedido(r.pedido_id, 'sistema');
    end if;
    perform public.reg_bitacora('sistema', 'cobro_vencido', r.pedido_id, r.cobro_id, null,
      jsonb_build_object('ruta', r.ruta_id is not null));
    v_c := v_c + 1;
  end loop;
  return jsonb_build_object('intentos_expirados', v_i, 'cobros_vencidos', v_c);
end $$;

-- 13) cancelar_pedido: documentos de ruta usan devolución
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

-- 14) verificar_integridad: quinta prueba de evidencias
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
  where p.estado = 'entregado'
    and not exists (select 1 from public.entregas_evidencia e where e.pedido_id = p.id);
  prueba := 'Entregas con evidencia registrada'; ok := v_n = 0;
  detalle := v_n || ' entregas sin evidencia'; return next;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
