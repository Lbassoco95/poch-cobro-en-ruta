-- BLOQUE 6 · RUTA DE DEMOSTRACIÓN PARA JUECES (correr DESPUÉS de datos-demo-ruta.sql)
-- Crea la ruta «Ruta Demo Jueces» de Repartidor Uno con tres documentos inventados:
-- DEMO-R-002, DEMO-N-015 y DEMO-OC-0231. No toca la «Ruta Demo Centro» ni sus documentos.
-- No choca si ya existe: si la ruta ya está, la reutiliza; si un folio ya está cargado, lo omite.
-- Con los de datos-demo-ruta.sql suman seis folios en dos rutas abiertas, y el repartidor ve las dos en «Mi ruta».
-- Datos inventados, precios en centavos.
do $$
declare rep uuid; ruta uuid; res jsonb;
        p_clu uuid; p_foc uuid; p_buj uuid; p_fil uuid; p_bal uuid; p_cad uuid;
begin
  select user_id into rep from public.perfiles where nombre = 'Repartidor Uno' and rol = 'repartidor';
  if rep is null then raise exception 'Falta el Repartidor Uno (corre antes el Bloque 3)'; end if;
  select id into p_clu from public.productos where sku = 'DEMO-CLU-01';
  select id into p_foc from public.productos where sku = 'DEMO-FOC-01';
  select id into p_buj from public.productos where sku = 'DEMO-BUJ-01';
  select id into p_fil from public.productos where sku = 'DEMO-FIL-01';
  select id into p_bal from public.productos where sku = 'DEMO-BAL-01';
  select id into p_cad from public.productos where sku = 'DEMO-CAD-01';

  select id into ruta from public.rutas
   where nombre = 'Ruta Demo Jueces' and repartidor_id = rep order by creado_en desc limit 1;
  if ruta is null then
    res := public.crear_ruta(gen_random_uuid(), rep, 'Ruta Demo Jueces', null, 'demo');
    ruta := (res->>'ruta_id')::uuid;
  end if;

  if not exists (select 1 from public.pedidos where tipo_documento = 'remision' and folio_documento = 'DEMO-R-002') then
    perform public.cargar_documento(gen_random_uuid(), ruta, 'remision', 'DEMO-R-002', 'Mecánica Rápida del Norte',
      jsonb_build_array(jsonb_build_object('producto_id', p_clu, 'cantidad', 2),
                        jsonb_build_object('producto_id', p_foc, 'cantidad', 1)), 'demo');
  end if;
  if not exists (select 1 from public.pedidos where tipo_documento = 'nota_venta' and folio_documento = 'DEMO-N-015') then
    perform public.cargar_documento(gen_random_uuid(), ruta, 'nota_venta', 'DEMO-N-015', 'Taller Moto Express',
      jsonb_build_array(jsonb_build_object('producto_id', p_buj, 'cantidad', 3),
                        jsonb_build_object('producto_id', p_bal, 'cantidad', 1)), 'demo');
  end if;
  if not exists (select 1 from public.pedidos where tipo_documento = 'orden_compra' and folio_documento = 'DEMO-OC-0231') then
    perform public.cargar_documento(gen_random_uuid(), ruta, 'orden_compra', 'DEMO-OC-0231', 'Refaccionaria La Palma',
      jsonb_build_array(jsonb_build_object('producto_id', p_fil, 'cantidad', 2),
                        jsonb_build_object('producto_id', p_cad, 'cantidad', 1)), 'demo');
  end if;
end $$;

select r.nombre as ruta, p.parada, p.tipo_documento, p.folio_documento, p.cliente_alias, p.total, p.estado
from public.pedidos p join public.rutas r on r.id = p.ruta_id
where r.nombre in ('Ruta Demo Centro', 'Ruta Demo Jueces') order by r.nombre, p.parada;
