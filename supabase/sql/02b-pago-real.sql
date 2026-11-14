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
