-- BLOQUE 5 · RUTA DE DEMOSTRACIÓN (correr DESPUÉS de la migración de ruta y entrega)
-- Crea una ruta de hoy para Repartidor Uno con tres documentos inventados. Se puede correr una sola vez por día.
do $$
declare rep uuid; ruta uuid; res jsonb; p_bal uuid; p_cad uuid; p_buj uuid; p_fil uuid;
begin
  select user_id into rep from public.perfiles where nombre = 'Repartidor Uno' and rol = 'repartidor';
  if rep is null then raise exception 'Falta el Repartidor Uno (corre antes el Bloque 3)'; end if;
  select id into p_bal from public.productos where sku = 'DEMO-BAL-01';
  select id into p_cad from public.productos where sku = 'DEMO-CAD-01';
  select id into p_buj from public.productos where sku = 'DEMO-BUJ-01';
  select id into p_fil from public.productos where sku = 'DEMO-FIL-01';
  if exists (select 1 from public.pedidos where tipo_documento = 'remision' and folio_documento = 'DEMO-R-001') then
    raise notice 'La ruta de demostración ya existe; no se repite.'; return;
  end if;

  res := public.crear_ruta(gen_random_uuid(), rep, 'Ruta Demo Centro', null, 'demo');
  ruta := (res->>'ruta_id')::uuid;

  perform public.cargar_documento(gen_random_uuid(), ruta, 'remision', 'DEMO-R-001', 'Refaccionaria El Tornillo',
    jsonb_build_array(jsonb_build_object('producto_id', p_bal, 'cantidad', 2),
                      jsonb_build_object('producto_id', p_cad, 'cantidad', 1)), 'demo');
  perform public.cargar_documento(gen_random_uuid(), ruta, 'nota_venta', 'DEMO-N-014', 'Moto Servicio Los Pinos',
    jsonb_build_array(jsonb_build_object('producto_id', p_buj, 'cantidad', 4),
                      jsonb_build_object('producto_id', p_fil, 'cantidad', 2)), 'demo');
  perform public.cargar_documento(gen_random_uuid(), ruta, 'orden_compra', 'DEMO-OC-0230', 'Taller Hermanos Mena',
    jsonb_build_array(jsonb_build_object('producto_id', p_cad, 'cantidad', 2)), 'demo');
end $$;

select r.nombre, p.parada, p.tipo_documento, p.folio_documento, p.cliente_alias, p.total, p.estado
from public.pedidos p join public.rutas r on r.id = p.ruta_id
where r.nombre = 'Ruta Demo Centro' order by p.parada;
