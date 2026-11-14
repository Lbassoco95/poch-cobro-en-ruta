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
