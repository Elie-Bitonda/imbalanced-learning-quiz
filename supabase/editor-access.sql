-- Run in Supabase SQL Editor as project owner AFTER creating the user's Auth account.
-- Replace this placeholder with the groupmate's email. Never put passwords here.
insert into public.question_editors(user_id)
select id from auth.users where lower(email) = lower('groupmate@example.com')
on conflict (user_id) do nothing;

-- To revoke access later:
-- delete from public.question_editors where user_id in
--   (select id from auth.users where lower(email) = lower('groupmate@example.com'));
