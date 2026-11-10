-- =============================================================================
-- 0008 — Private storage buckets. Object keys start with <gym_id>/...
--   waivers/      signed waiver PDFs        <gym_id>/<member_id>/<sig_id>.pdf
--   documents/    fighter medical/licenses  <gym_id>/<fighter_id>/<doc_id>.<ext>
--   certificates/ belt certificates         <gym_id>/<member_id>/<reg_id>.pdf
--   exports/      data export ZIPs          <gym_id>/<timestamp>.zip
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('waivers', 'waivers', false), ('documents', 'documents', false),
       ('certificates', 'certificates', false), ('exports', 'exports', false)
on conflict (id) do nothing;

create or replace function app.object_gym_id(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

create or replace function app.object_member_id(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 2) ~ '^[0-9a-f-]{36}$'
              then split_part(p_name, '/', 2)::uuid end;
$$;

create policy storage_staff_read on storage.objects for select to authenticated
  using (bucket_id in ('waivers','documents','certificates') and app.is_staff(app.object_gym_id(name)));
create policy storage_desk_write on storage.objects for insert to authenticated
  with check (bucket_id in ('waivers','documents','certificates') and app.is_desk(app.object_gym_id(name)));
create policy storage_exports_manager on storage.objects for all to authenticated
  using (bucket_id = 'exports' and app.is_manager(app.object_gym_id(name)))
  with check (bucket_id = 'exports' and app.is_manager(app.object_gym_id(name)));
create policy storage_member_read on storage.objects for select to authenticated
  using (bucket_id in ('waivers','certificates') and app.object_member_id(name) in (select app.my_member_ids()));
