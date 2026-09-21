-- Presentation release controls for learner difficulty levels.
-- Run once in Supabase SQL Editor after 202609210001_shared_questions.sql.
begin;

create table public.study_level_releases (
  level text primary key check (level in ('mixed', 'beginner', 'medium', 'pro')),
  released boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.study_level_releases(level, released)
values
  ('beginner', false),
  ('medium', false),
  ('pro', false),
  ('mixed', false)
on conflict (level) do nothing;

alter table public.study_level_releases enable row level security;
revoke all on public.study_level_releases from anon, authenticated;
grant select on public.study_level_releases to anon, authenticated;
grant update on public.study_level_releases to authenticated;

create policy "Anyone can read study level releases"
  on public.study_level_releases
  for select
  to anon, authenticated
  using (true);

create policy "Editors can update study level releases"
  on public.study_level_releases
  for update
  to authenticated
  using (public.is_question_editor())
  with check (public.is_question_editor());

create function public.read_study_level_releases() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(level, released), '{}'::jsonb)
  from public.study_level_releases;
$$;
revoke all on function public.read_study_level_releases() from public;
grant execute on function public.read_study_level_releases() to anon, authenticated;

create function public.set_study_level_release(target_level text, new_released boolean) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_question_editor() then
    raise exception 'An authorized editor account is required.' using errcode = '42501';
  end if;

  if target_level is null or target_level not in ('mixed', 'beginner', 'medium', 'pro') then
    raise exception 'Unsupported study level.';
  end if;

  update public.study_level_releases
  set released = new_released,
      updated_at = now(),
      updated_by = auth.uid()
  where level = target_level;

  if not found then
    raise exception 'Study level release state was not found.';
  end if;

  return public.read_study_level_releases();
end;
$$;
revoke all on function public.set_study_level_release(text, boolean) from public, anon;
grant execute on function public.set_study_level_release(text, boolean) to authenticated;

commit;
