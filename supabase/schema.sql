-- Personal practice progress. Applied to the linked Supabase project as
-- create_practice_sync; keep this file as the reviewed schema source.
create table public.practice_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_date date not null,
  exercise_id text not null check (char_length(exercise_id) between 1 and 128),
  answer text not null check (char_length(answer) <= 4000),
  is_correct boolean not null,
  grammar_points text[] not null check (cardinality(grammar_points) between 1 and 12),
  client_updated_at timestamptz not null,
  primary key (user_id, lesson_date, exercise_id)
);

create table public.practice_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_date date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_date)
);

create table public.practice_daily_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_date date not null,
  exercise_ids text[] not null check (cardinality(exercise_ids) between 1 and 10),
  primary key (user_id, lesson_date)
);

alter table public.practice_attempts enable row level security;
alter table public.practice_completions enable row level security;
alter table public.practice_daily_selections enable row level security;

revoke all on public.practice_attempts, public.practice_completions,
  public.practice_daily_selections from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.practice_attempts,
  public.practice_completions, public.practice_daily_selections to authenticated;

create policy "read own attempts" on public.practice_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own attempts" on public.practice_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own attempts" on public.practice_attempts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "read own completions" on public.practice_completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own completions" on public.practice_completions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own completions" on public.practice_completions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "read own selections" on public.practice_daily_selections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own selections" on public.practice_daily_selections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own selections" on public.practice_daily_selections
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
