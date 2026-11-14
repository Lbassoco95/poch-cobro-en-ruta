-- BLOQUE 3 · DATOS DE DEMOSTRACIÓN (correr DESPUÉS de crear los tres usuarios en Authentication)
-- Usuarios esperados: admin@demo.invalid, repartidor1@demo.invalid, repartidor2@demo.invalid
insert into public.perfiles (user_id, rol, nombre)
select id, 'admin', 'Administración Demo' from auth.users where email = 'admin@demo.invalid'
on conflict (user_id) do nothing;
insert into public.perfiles (user_id, rol, nombre)
select id, 'repartidor', 'Repartidor Uno' from auth.users where email = 'repartidor1@demo.invalid'
on conflict (user_id) do nothing;
insert into public.perfiles (user_id, rol, nombre)
select id, 'repartidor', 'Repartidor Dos' from auth.users where email = 'repartidor2@demo.invalid'
on conflict (user_id) do nothing;

-- Catálogo inventado. Precios de demostración en centavos para no mover dinero real significativo.
insert into public.productos (sku, nombre, precio) values
  ('DEMO-BAL-01', 'Balata delantera (juego)', 0.03),
  ('DEMO-CAD-01', 'Cadena de transmisión 428', 0.05),
  ('DEMO-BUJ-01', 'Bujía estándar', 0.01),
  ('DEMO-FIL-01', 'Filtro de aceite', 0.02),
  ('DEMO-CLU-01', 'Cable de clutch', 0.02),
  ('DEMO-FOC-01', 'Foco delantero LED', 0.04)
on conflict (sku) do nothing;

-- Carga inicial de la camioneta: 10 piezas de cada producto por repartidor
insert into public.movimientos_stock (repartidor_id, producto_id, tipo, cantidad, actor)
select pf.user_id, pr.id, 'carga', 10, 'sembrado'
from public.perfiles pf cross join public.productos pr
where pf.rol = 'repartidor'
  and not exists (select 1 from public.movimientos_stock m
                  where m.repartidor_id = pf.user_id and m.producto_id = pr.id and m.tipo = 'carga');

select public.reg_bitacora('sembrado', 'datos_demo_cargados', null, null, null, '{}'::jsonb);
