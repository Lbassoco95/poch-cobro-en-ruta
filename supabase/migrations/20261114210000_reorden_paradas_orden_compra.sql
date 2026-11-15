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
