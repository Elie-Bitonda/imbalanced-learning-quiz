-- Run once in the Supabase SQL editor, or apply with `supabase db push`.
begin;

create table public.question_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.question_editors enable row level security;
revoke all on public.question_editors from anon, authenticated;
grant select on public.question_editors to authenticated;
create policy "Editors can check their own membership" on public.question_editors
  for select to authenticated using (user_id = (select auth.uid()));

create function public.is_question_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.question_editors where user_id = (select auth.uid()));
$$;
revoke all on function public.is_question_editor() from public;
grant execute on function public.is_question_editor() to anon, authenticated;

create function public.valid_question_answers(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare a jsonb; ids text[] := '{}'; correct_count integer := 0;
begin
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) < 2 then return false; end if;
  for a in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'id') is distinct from 'string'
      or coalesce(length(btrim(a->>'id')), 0) = 0 or (a->>'id') = any(ids)
      or jsonb_typeof(a->'text') is distinct from 'string' or coalesce(length(btrim(a->>'text')), 0) = 0
      or jsonb_typeof(a->'isCorrect') is distinct from 'boolean' then return false; end if;
    ids := array_append(ids, a->>'id');
    if (a->>'isCorrect')::boolean then correct_count := correct_count + 1; end if;
  end loop;
  return correct_count = 1;
end;
$$;

create table public.questions (
  id text primary key check (length(btrim(id)) between 1 and 200),
  question text not null check (length(btrim(question)) > 0),
  answers jsonb not null check (public.valid_question_answers(answers)),
  explanation text not null check (length(btrim(explanation)) > 0),
  difficulty text not null default 'general' check (difficulty in ('general','beginner','medium','pro')),
  category text not null default '',
  tags text[] not null default '{}' check (array_position(tags, null) is null),
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  revision bigint not null default 1
);
create index questions_difficulty_order on public.questions(difficulty, order_index, id);
create index questions_order on public.questions(order_index, id);
alter table public.questions enable row level security;
revoke all on public.questions from anon, authenticated;
grant select on public.questions to anon, authenticated;
grant insert, update, delete on public.questions to authenticated;
create policy "Everyone may study" on public.questions for select to anon, authenticated using (true);
create policy "Only editors insert" on public.questions for insert to authenticated with check ((select public.is_question_editor()));
create policy "Only editors update" on public.questions for update to authenticated using ((select public.is_question_editor())) with check ((select public.is_question_editor()));
create policy "Only editors delete" on public.questions for delete to authenticated using ((select public.is_question_editor()));

create table public.question_bank_state (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0
);
insert into public.question_bank_state(singleton) values(true);
alter table public.question_bank_state enable row level security;
revoke all on public.question_bank_state from anon, authenticated;
grant select on public.question_bank_state to anon, authenticated;
create policy "Read bank version" on public.question_bank_state for select to anon, authenticated using (true);

-- Direct editor writes also update the version; callers cannot forge attribution/revisions.
create function public.track_question_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(90210921);
  update public.question_bank_state set revision = revision + 1 where singleton;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then
    if auth.uid() is not null then new.created_by := old.created_by; end if;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
  else
    new.created_by := auth.uid();
    new.revision := 1;
  end if;
  if tg_op = 'UPDATE' and (new.question, new.answers, new.explanation, new.difficulty, new.category, new.tags)
    is not distinct from (old.question, old.answers, old.explanation, old.difficulty, old.category, old.tags)
    then new.updated_at := old.updated_at;
  else new.updated_at := clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function public.track_question_change() from public;
create trigger track_question_change before insert or update or delete on public.questions
for each row execute function public.track_question_change();

-- JSON avoids PostgREST row caps and takes one consistent snapshot of records/version.
create function public.read_question_bank() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', s.revision::text, 'questions',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'question', q.question, 'answers', q.answers, 'explanation', q.explanation,
      'difficulty', q.difficulty, 'category', q.category, 'tags', q.tags, 'order', q.order_index,
      'createdAt', q.created_at, 'updatedAt', q.updated_at, 'createdBy', q.created_by, 'revision', q.revision::text
    ) order by q.order_index, q.id) from public.questions q), '[]'::jsonb))
  from public.question_bank_state s where singleton;
$$;
revoke all on function public.read_question_bank() from public;
grant execute on function public.read_question_bank() to anon, authenticated;

-- One transaction for mutations, including reorder and whole-bank import.
-- Content edits compare row revisions; bulk operations compare the bank revision.
create function public.mutate_questions(action text, payload jsonb, expected text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; current_revision text; next_order integer; source_order integer; changed integer;
begin
  if not public.is_question_editor() then raise exception 'An authorized editor account is required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(90210921);
  if action in ('replace', 'reorder', 'duplicate') then
    select revision::text into current_revision from public.question_bank_state where singleton;
    if expected is distinct from current_revision then raise exception 'The question bank changed. Refresh and try again.' using errcode = '40001'; end if;
  end if;
  if action = 'update' then
    update public.questions set question = payload->>'question', answers = payload->'answers',
      explanation = payload->>'explanation', difficulty = coalesce(payload->>'difficulty', 'general'),
      category = coalesce(payload->>'category', ''), tags = array(select jsonb_array_elements_text(payload->'tags'))
    where id = payload->>'id' and revision::text = expected;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'This question was changed or deleted by another editor. Keep your draft, then reopen the latest question.' using errcode = '40001'; end if;
  elsif action = 'delete' then
    delete from public.questions where id = payload->>'id' and revision::text = expected;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'This question changed. Refresh before deleting it.' using errcode = '40001'; end if;
  elsif action = 'reorder' then
    if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) <> (select count(*) from public.questions)
      or (select count(distinct value) from jsonb_array_elements_text(payload)) <> jsonb_array_length(payload)
      or exists(select 1 from jsonb_array_elements_text(payload) a where not exists(select 1 from public.questions q where q.id = a.value))
      then raise exception 'Reorder must contain every question ID exactly once.'; end if;
    update public.questions q set order_index = a.ordinality - 1
      from jsonb_array_elements_text(payload) with ordinality a where q.id = a.value and q.order_index <> a.ordinality - 1;
  elsif action in ('create', 'duplicate', 'append', 'replace', 'migrate') then
    if action = 'replace' then delete from public.questions; end if;
    if action = 'duplicate' then
      select order_index into source_order from public.questions where id = payload->>'sourceId';
      if source_order is null then raise exception 'The original question was deleted.'; end if;
      update public.questions set order_index = order_index + 1 where order_index > source_order;
      next_order := source_order + 1;
      payload := jsonb_build_array(payload->'question');
    else
      select coalesce(max(order_index) + 1, 0) into next_order from public.questions;
      if action = 'create' then payload := jsonb_build_array(payload); end if;
    end if;
    if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 10000 then raise exception 'Expected up to 10,000 valid questions.'; end if;
    for item in select * from jsonb_array_elements(payload) loop
      -- Repeating a migration is safe; matching IDs never overwrite shared edits.
      if action = 'migrate' and exists(select 1 from public.questions where id = item->>'id') then continue; end if;
      insert into public.questions(id, question, answers, explanation, difficulty, category, tags, order_index, created_at)
      values(item->>'id', item->>'question', item->'answers', item->>'explanation',
        coalesce(item->>'difficulty', 'general'), coalesce(item->>'category', ''),
        array(select jsonb_array_elements_text(item->'tags')), next_order,
        coalesce((item->>'createdAt')::timestamptz, now()));
      next_order := next_order + 1;
    end loop;
  else raise exception 'Unsupported question operation.';
  end if;
  return public.read_question_bank();
end;
$$;
revoke all on function public.mutate_questions(text, jsonb, text) from public, anon;
grant execute on function public.mutate_questions(text, jsonb, text) to authenticated;
commit;
