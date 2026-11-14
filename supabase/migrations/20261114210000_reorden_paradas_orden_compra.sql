-- COMPLEMENTO · Orden de compra en el documento y reorden de paradas
-- AVISO: Polo indicó que pegaría este archivo en el chat; no llegó. Se armó a partir del
-- complemento (columnas, firmas y reglas). Si tiene el SQL original, sustitúyalo tal cual.

alter table public.pedidos
  add column if not exists orden_compra_ref text,
  add column if not exists zona text;

alter table public.pedidos drop constraint if exists pedidos_orden_compra_ref_check;
alter table public.pedidos add constraint pedidos_orden_compra_ref_check
  check (orden_compra_ref is null or char_length(trim(orden_compra_ref)) between 1 and 40);

alter table public.pedidos drop constraint if exists pedidos_zona_check;
alter table public.pedidos add constraint pedidos_zona_check
  check (zona is null or char_length(trim(zona)) between 1 and 60);

-- Sustituye cargar_documento para aceptar orden de compra y zona
drop function if exists public.cargar_documento(uuid, uuid, text, text, text, jsonb, text);

create or replace function public.cargar_documento(
  p_op uuid, p_ruta uuid, p_tipo text, p_folio text, p_cliente text,
  p_lineas jsonb, p_actor text,
  p_orden_compra text default null,
  p_zona text default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_ped uuid; v_folio bigint; v_parada int; v_total numeric(12,2) := 0;
  l record; v_prod record; v_res jsonb; v_oc text; v_zona text;
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

  v_oc := case when p_orden_compra is null or trim(p_orden_compra) = '' then null else left(trim(p_orden_compra), 40) end;
  v_zona := case when p_zona is null or trim(p_zona) = '' then null else left(trim(p_zona), 60) end;

  select coalesce(max(parada), 0) + 1 into v_parada from public.pedidos where ruta_id = p_ruta;
  perform pg_advisory_xact_lock(hashtext(r.repartidor_id::text));

  insert into public.pedidos (
    repartidor_id, cliente_alias, total, estado, ruta_id, tipo_documento, folio_documento,
    parada, orden_compra_ref, zona)
  values (
    r.repartidor_id, left(trim(p_cliente), 60), 0.01, 'pendiente', p_ruta, p_tipo, trim(p_folio),
    v_parada, v_oc, v_zona)
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
    jsonb_build_object('ruta_id', p_ruta, 'tipo', p_tipo, 'folio_documento', trim(p_folio),
                       'orden_compra', v_oc, 'zona', v_zona, 'parada', v_parada, 'total', v_total));
  v_res := jsonb_build_object(
    'pedido_id', v_ped, 'folio', v_folio, 'parada', v_parada, 'tipo', p_tipo,
    'folio_documento', trim(p_folio), 'orden_compra', v_oc, 'total', v_total);
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

-- Reordenar paradas pendientes o por cobrar del repartidor dueño
create or replace function public.reordenar_paradas(
  p_op uuid, p_ruta uuid, p_repartidor uuid, p_orden uuid[], p_motivo text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_rep jsonb; r public.rutas; v_antes uuid[]; v_despues uuid[]; v_id uuid; v_i int := 0; v_res jsonb;
  v_movibles int; v_en_orden int;
begin
  v_rep := public.iniciar_operacion(p_op, 'reordenar_paradas', p_repartidor::text);
  if v_rep is not null then return v_rep; end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then raise exception 'NOTA_OBLIGATORIA'; end if;
  if p_orden is null or coalesce(array_length(p_orden, 1), 0) = 0 then raise exception 'ORDEN_INVALIDA'; end if;

  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;
  if r.estado <> 'abierta' then raise exception 'RUTA_CERRADA'; end if;
  if r.repartidor_id <> p_repartidor then raise exception 'RUTA_AJENA'; end if;

  select coalesce(array_agg(id order by parada), '{}') into v_antes
  from public.pedidos
  where ruta_id = p_ruta and estado in ('pendiente','por_cobrar');

  select count(*) into v_movibles
  from public.pedidos where ruta_id = p_ruta and estado in ('pendiente','por_cobrar');
  if coalesce(array_length(p_orden, 1), 0) <> v_movibles then raise exception 'ORDEN_INVALIDA'; end if;

  select count(*) into v_en_orden
  from public.pedidos
  where ruta_id = p_ruta and estado in ('pendiente','por_cobrar') and id = any(p_orden);
  if v_en_orden <> v_movibles then raise exception 'ORDEN_INVALIDA'; end if;
  if (select count(distinct x) from unnest(p_orden) x) <> v_movibles then raise exception 'ORDEN_INVALIDA'; end if;

  -- Hueco temporal para no chocar con único (ruta, parada) si existiera
  update public.pedidos set parada = parada + 1000
  where ruta_id = p_ruta and estado in ('pendiente','por_cobrar');

  foreach v_id in array p_orden loop
    v_i := v_i + 1;
    update public.pedidos set parada = v_i, actualizado_en = now() where id = v_id and ruta_id = p_ruta;
  end loop;

  select coalesce(array_agg(id order by parada), '{}') into v_despues
  from public.pedidos
  where ruta_id = p_ruta and estado in ('pendiente','por_cobrar');

  perform public.reg_bitacora(p_repartidor::text, 'ruta_reordenada', null, null, p_op,
    jsonb_build_object(
      'ruta_id', p_ruta,
      'antes', to_jsonb(v_antes),
      'despues', to_jsonb(v_despues),
      'motivo', left(trim(p_motivo), 300)));

  v_res := jsonb_build_object('ruta_id', p_ruta, 'orden', to_jsonb(v_despues));
  update public.operaciones set resultado = v_res where operacion_id = p_op;
  return v_res;
end $$;

revoke execute on function public.cargar_documento(uuid, uuid, text, text, text, jsonb, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.reordenar_paradas(uuid, uuid, uuid, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.cargar_documento(uuid, uuid, text, text, text, jsonb, text, text, text)
  to service_role;
grant execute on function public.reordenar_paradas(uuid, uuid, uuid, uuid[], text)
  to service_role;
