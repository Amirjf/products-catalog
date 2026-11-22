INSERT INTO products (sku, name, description, category, price_cents, attributes, created_at, updated_at)
SELECT
  'SKU-' || lpad(i::text, 7, '0'),
  initcap(replace(cat, '-', ' ')) || ' item ' || i,
  'Seeded product number ' || i || ' in ' || cat || '.',
  cat,
  (1 + floor(r_price * 2000))::int * 50 - 1,
  jsonb_build_object('color', (ARRAY['black', 'white', 'red', 'blue', 'green'])[1 + floor(r_color * 5)::int]),
  created,
  created
FROM (
  SELECT
    i,
    (ARRAY[
      'phones', 'laptops', 'tablets', 'headphones', 'cameras', 'monitors', 'keyboards', 'mice',
      'printers', 'speakers', 'tvs', 'smartwatches', 'consoles', 'games', 'books', 'toys',
      'shoes', 'shirts', 'trousers', 'jackets', 'dresses', 'hats', 'bags', 'watches',
      'sofas', 'tables', 'chairs', 'beds', 'lamps', 'rugs', 'cookware', 'cutlery',
      'bikes', 'tents', 'fitness', 'skincare', 'makeup', 'pet-supplies', 'garden-tools', 'car-parts'
    ])[1 + floor(random() * 40)::int] AS cat,
    random() AS r_price,
    random() AS r_color,
    now() - random() * interval '730 days' AS created
  FROM generate_series(1, 300000) AS i
) AS s;

ANALYZE products;
