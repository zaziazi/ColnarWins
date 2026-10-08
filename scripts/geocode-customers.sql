-- Temporary geocoder for customers (see scripts/README.md). Requires the `http` extension.
create or replace function public.tmp_geocode_batch(p_limit int)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  r record;
  resp http_response;
  hit jsonb;
  q text;
  v_lat double precision;
  v_lng double precision;
  v_quality text;
  v_rank int;
  disp text;
  city_norm text;
  n_done int := 0;
  stop_reason text;
  attempt int;
begin
  -- Foreign addresses (non 4-digit post code) are never geocoded: mark as attempted, no position.
  update customer set geocoded_at = now()
   where geocoded_at is null and (post_code is null or post_code !~ '^[0-9]{4}$');

  for r in
    select id, address, post_code, city from customer
    where geocoded_at is null and (coalesce(address,'') <> '' or coalesce(city,'') <> '')
    order by (post_code like '8%') desc, (post_code like '1%') desc, id
    limit p_limit
  loop
    v_lat := null; v_lng := null; v_quality := null;
    city_norm := lower(unaccent(split_part(coalesce(r.city, ''), ' ', 1)));

    for attempt in 1..3 loop
      exit when v_lat is not null;
      if attempt = 1 then
        continue when coalesce(r.address, '') = '';
        q := concat_ws(', ', r.address, concat_ws(' ', r.post_code, r.city));
      elsif attempt = 2 then
        continue when coalesce(r.city, '') = '';
        q := concat_ws(' ', r.post_code, r.city);
      else
        continue when coalesce(r.city, '') = '';
        q := r.city;
      end if;

      begin
        resp := http((
          'GET',
          'https://nominatim.openstreetmap.org/search?q=' || urlencode(q) || '&format=jsonv2&limit=1&countrycodes=si&addressdetails=0',
          ARRAY[http_header('User-Agent', 'colnix-sales-map/1.0 (colnar.aljaz.ac@gmail.com)')],
          NULL, NULL)::http_request);
      exception when others then
        stop_reason := 'http error: ' || sqlerrm;
        exit;
      end;
      perform pg_sleep(1.1);

      if resp.status <> 200 then
        stop_reason := 'status ' || resp.status;
        exit;
      end if;

      if resp.content::jsonb <> '[]'::jsonb then
        hit := (resp.content::jsonb) -> 0;
        disp := lower(unaccent(coalesce(hit ->> 'display_name', '')));
        v_rank := coalesce((hit ->> 'place_rank')::int, 0);
        -- sanity: the hit must be in the customer's town or post code
        if city_norm = '' or disp like '%' || city_norm || '%'
           or (coalesce(r.post_code, '') <> '' and disp like '%' || r.post_code || '%') then
          v_lat := (hit ->> 'lat')::double precision;
          v_lng := (hit ->> 'lon')::double precision;
          v_quality := case
            when attempt > 1 then 'city'
            when v_rank >= 30 then 'house'
            when v_rank >= 26 then 'street'
            else 'city' end;
        end if;
      end if;
    end loop;

    exit when stop_reason is not null;

    update customer set lat = v_lat, lng = v_lng, geocode_quality = v_quality, geocoded_at = now()
     where id = r.id;
    n_done := n_done + 1;
  end loop;

  return jsonb_build_object(
    'processed', n_done,
    'stopped', stop_reason,
    'remaining', (select count(*) from customer where geocoded_at is null)
  );
end;
$$;
