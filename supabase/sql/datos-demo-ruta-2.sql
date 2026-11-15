-- BLOQUE 6 · TRES DOCUMENTOS DE DEMOSTRACIÓN MÁS (correr DESPUÉS de datos-demo-ruta.sql)
-- Agrega tres paradas (4 a 6) a la «Ruta Demo Centro» que ya existe. No modifica la ruta ni sus tres documentos.
-- Con los de datos-demo-ruta.sql suman seis folios: DEMO-R-001, DEMO-N-014, DEMO-OC-0230, DEMO-R-002, DEMO-N-015 y DEMO-OC-0231.
-- Datos inventados, precios en centavos. Se puede correr más de una vez: si ya está cargado, no repite.
-- NOTA DE REVISIÓN: el mensaje que pedía este archivo llegó sin el SQL; esta versión la escribió revisión con la
-- misma forma que datos-demo-ruta.sql. Polo debe leerla antes de pegarla en producción.
do $$
declare ruta uuid; rep uuid; p_clu uuid; p_foc uuid; p_buj uuid; p_fil uuid; p_bal uuid; p_cad uuid;
begin
  select id, repartidor_id into ruta, rep from public.rutas where nombre = 'Ruta Demo Centro' and estado = 'abierta'
    order by creado_en desc limit 1;
  if ruta is null then raise exception 'Falta la Ruta Demo Centro abierta (corre antes datos-demo-ruta.sql)'; end if;
  select id into p_clu from public.productos where sku = 'DEMO-CLU-01';
  select id into p_foc from public.productos where sku = 'DEMO-FOC-01';
  select id into p_buj from public.productos where sku = 'DEMO-BUJ-01';
  select id into p_fil from public.productos where sku = 'DEMO-FIL-01';
  select id into p_bal from public.productos where sku = 'DEMO-BAL-01';
  select id into p_cad from public.productos where sku = 'DEMO-CAD-01';

  if exists (select 1 from public.pedidos where tipo_documento = 'remision' and folio_documento = 'DEMO-R-002') then
    raise notice 'Los tres documentos adicionales ya existen; no se repiten.'; return;
  end if;

  perform public.cargar_documento(gen_random_uuid(), ruta, 'remision', 'DEMO-R-002', 'Mecánica Rápida del Norte',
    jsonb_build_array(jsonb_build_object('producto_id', p_clu, 'cantidad', 2),
                      jsonb_build_object('producto_id', p_foc, 'cantidad', 1)), 'demo', 'DEMO-OC-0231');
  perform public.cargar_documento(gen_random_uuid(), ruta, 'nota_venta', 'DEMO-N-015', 'Taller Moto Express',
    jsonb_build_array(jsonb_build_object('producto_id', p_buj, 'cantidad', 3),
                      jsonb_build_object('producto_id', p_bal, 'cantidad', 1)), 'demo');
  perform public.cargar_documento(gen_random_uuid(), ruta, 'orden_compra', 'DEMO-OC-0231', 'Refaccionaria La Palma',
    jsonb_build_array(jsonb_build_object('producto_id', p_fil, 'cantidad', 2),
                      jsonb_build_object('producto_id', p_cad, 'cantidad', 1)), 'demo');
end $$;

select p.parada, p.tipo_documento, p.folio_documento, p.cliente_alias, p.total, p.estado
from public.pedidos p join public.rutas r on r.id = p.ruta_id
where r.nombre = 'Ruta Demo Centro' order by p.parada;
