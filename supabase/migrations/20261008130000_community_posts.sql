-- Community features: player-posted dog/owner questions, comments, ratings,
-- shares, and a two-score leaderboard. Built to exercise Supabase RLS for the
-- three kinds of caller:
--
--   anon           no JWT, or the publishable key only
--   authenticated  a signed-in user; auth.uid() is their id
--   admin          a signed-in user whose app_metadata.role is 'admin'
--
-- Privacy rule: a user can read all of their own rows, an admin can read
-- every row, and nobody else can list another user's posts or comments.
-- Everyone (anon included) still sees published questions and comments, but
-- only through the security definer functions near the end of this file,
-- which leave out who wrote them.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Admin comes from app_metadata in the JWT. Users cannot edit app_metadata;
-- only the service role or SQL can. Make someone an admin with:
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--   where email = 'you@example.com';
-- They pick it up the next time their session token refreshes.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

-- ---------------------------------------------------------------------------
-- profiles: one per auth user, created by a trigger on sign-up
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  -- The anonymous game player whose correct answers count toward this user's
  -- leaderboard score. Set through link_player(), which checks the player key.
  player_id uuid unique references public.players (id) on delete set null,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    ), 20)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- True when the signed-in user has been banned by an admin.
create or replace function private.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- user_questions: a dog photo and an owner photo; others guess "match?"
-- ---------------------------------------------------------------------------

create table public.user_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dog_photo_path text not null check (char_length(dog_photo_path) between 1 and 200),
  owner_photo_path text not null check (char_length(owner_photo_path) between 1 and 200),
  is_match boolean not null,
  caption text check (char_length(caption) <= 140),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);
create index user_questions_author_idx on public.user_questions (author_id);

-- Published, or posted by the caller. Runs as definer so policies on other
-- tables can ask about a question the caller is not allowed to select.
create or replace function private.question_is_open(q uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_questions
    where id = q and (status = 'published' or author_id = auth.uid())
  )
$$;

-- Published and not the caller's own: you cannot rate yourself.
create or replace function private.can_rate(q uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_questions
    where id = q and status = 'published' and author_id <> auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- comments: on a built-in round (pair_id like 'golden-3') or a user question
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id uuid references public.user_questions (id) on delete cascade,
  pair_id text check (pair_id ~ '^[a-z]{3,12}-[0-7]$'),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(question_id, pair_id) = 1)
);
create index comments_author_idx on public.comments (author_id);
create index comments_question_idx on public.comments (question_id);
create index comments_pair_idx on public.comments (pair_id);

-- ---------------------------------------------------------------------------
-- question_ratings: 1 to 5 stars, one per user per question
-- ---------------------------------------------------------------------------

create table public.question_ratings (
  question_id uuid not null references public.user_questions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);
create index question_ratings_user_idx on public.question_ratings (user_id);

-- ---------------------------------------------------------------------------
-- question_shares: a share link for a round or user question
-- ---------------------------------------------------------------------------

create table public.question_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id uuid references public.user_questions (id) on delete cascade,
  pair_id text check (pair_id ~ '^[a-z]{3,12}-[0-7]$'),
  share_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now(),
  check (num_nonnulls(question_id, pair_id) = 1)
);
create index question_shares_user_idx on public.question_shares (user_id);

-- ---------------------------------------------------------------------------
-- Table privileges (GRANT) come before RLS: a role needs the privilege on the
-- table or column, and then RLS decides which rows. Supabase grants ALL on new
-- public tables to anon and authenticated, so start from nothing.
-- anon gets no table access at all; it reads through the functions below.
-- Column lists stop users from writing author_id/user_id (the default fills
-- in auth.uid()), flipping is_match after people have guessed, or unbanning
-- themselves.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.user_questions, public.comments,
  public.question_ratings, public.question_shares from anon, authenticated;

grant select, delete on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.user_questions to authenticated;
grant insert (dog_photo_path, owner_photo_path, is_match, caption) on public.user_questions to authenticated;
grant update (caption, status) on public.user_questions to authenticated;

grant select, delete on public.comments to authenticated;
grant insert (question_id, pair_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;

grant select, delete on public.question_ratings to authenticated;
grant insert (question_id, stars) on public.question_ratings to authenticated;
grant update (stars) on public.question_ratings to authenticated;

-- No UPDATE grant or policy: a share is immutable; delete it and make another.
grant select, delete on public.question_shares to authenticated;
grant insert (question_id, pair_id, note) on public.question_shares to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Permissive policies for the same command are OR'ed: "owner" OR "admin".
-- Restrictive policies are AND'ed on top: "and not banned".
-- A command with no policy for a role is denied (that is how anon is locked
-- out, and how UPDATE on shares is blocked even for the owner).
-- auth.uid() and is_admin() are wrapped in (select ...) so Postgres runs them
-- once per statement instead of once per row.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_questions enable row level security;
alter table public.comments enable row level security;
alter table public.question_ratings enable row level security;
alter table public.question_shares enable row level security;

-- profiles ------------------------------------------------------------------
-- INSERT happens only through the sign-up trigger, so there is no insert policy.
create policy "profiles: owner reads" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner renames" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles: admin full access" on public.profiles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- user_questions ------------------------------------------------------------
create policy "questions: owner reads" on public.user_questions
  for select to authenticated
  using (author_id = (select auth.uid()));

-- The photos must be files this user uploaded (storage.objects RLS applies
-- inside the subquery too, so it only sees the caller's own files anyway).
create policy "questions: owner posts" on public.user_questions
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from storage.objects o
                where o.bucket_id = 'question-photos' and o.name = dog_photo_path
                  and o.owner_id = (select auth.uid())::text)
    and exists (select 1 from storage.objects o
                where o.bucket_id = 'question-photos' and o.name = owner_photo_path
                  and o.owner_id = (select auth.uid())::text)
  );

create policy "questions: owner edits" on public.user_questions
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "questions: owner deletes" on public.user_questions
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "questions: admin full access" on public.user_questions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "questions: banned users cannot post" on public.user_questions
  as restrictive for insert to authenticated
  with check (not (select private.is_banned()));

-- comments ------------------------------------------------------------------
create policy "comments: owner reads" on public.comments
  for select to authenticated
  using (author_id = (select auth.uid()));

create policy "comments: owner writes" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (pair_id is not null or private.question_is_open(question_id))
  );

create policy "comments: owner edits" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "comments: owner deletes" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "comments: admin full access" on public.comments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "comments: banned users cannot write" on public.comments
  as restrictive for insert to authenticated
  with check (not (select private.is_banned()));

create policy "comments: banned users cannot edit" on public.comments
  as restrictive for update to authenticated
  using (not (select private.is_banned()));

-- question_ratings ----------------------------------------------------------
create policy "ratings: owner reads" on public.question_ratings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ratings: owner rates others' published questions" on public.question_ratings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_rate(question_id));

create policy "ratings: owner changes stars" on public.question_ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ratings: owner removes" on public.question_ratings
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "ratings: admin full access" on public.question_ratings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "ratings: banned users cannot rate" on public.question_ratings
  as restrictive for insert to authenticated
  with check (not (select private.is_banned()));

-- question_shares -----------------------------------------------------------
create policy "shares: owner reads" on public.question_shares
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "shares: owner shares open questions" on public.question_shares
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (pair_id is not null or private.question_is_open(question_id))
  );

create policy "shares: owner deletes" on public.question_shares
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "shares: admin full access" on public.question_shares
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: bucket for uploaded photos
--
-- Public bucket, so the game can show photos to anyone by URL. Uploads are
-- named uploads/<random uuid>.<ext>, never by user id, so a URL does not
-- reveal who posted it. There is no "everyone can select" policy, so nobody
-- can list the bucket to find another user's files.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-photos', 'question-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos: users upload to uploads/" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'question-photos'
    and (storage.foldername(name))[1] = 'uploads'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and not (select private.is_banned())
  );

create policy "photos: owner lists own" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-photos'
         and (owner_id = (select auth.uid())::text or (select public.is_admin())));

create policy "photos: owner replaces own" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-photos' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'question-photos' and owner_id = (select auth.uid())::text);

create policy "photos: owner or admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-photos'
         and (owner_id = (select auth.uid())::text or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- Public read functions. SECURITY DEFINER runs them as the table owner, so
-- they bypass RLS; each one decides for itself what to return. None of them
-- returns author ids, user ids, display names of authors, or is_match.
-- ---------------------------------------------------------------------------

-- Published user questions, newest first, with rating and comment totals.
create or replace function public.question_feed()
returns table (
  id uuid, dog_photo_path text, owner_photo_path text, caption text, created_at timestamptz,
  rating_avg numeric, rating_count int, comment_count int, is_mine boolean, my_stars smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.dog_photo_path, q.owner_photo_path, q.caption, q.created_at,
         (select round(avg(r.stars), 2) from public.question_ratings r where r.question_id = q.id),
         (select count(*)::int from public.question_ratings r where r.question_id = q.id),
         (select count(*)::int from public.comments c where c.question_id = q.id),
         coalesce(q.author_id = auth.uid(), false),
         (select r.stars from public.question_ratings r where r.question_id = q.id and r.user_id = auth.uid())
  from public.user_questions q
  where q.status = 'published'
  order by q.created_at desc
$$;

-- Comments on one round or one question. Authors stay anonymous to others;
-- is_mine lets the app show "you" and an edit button.
create or replace function public.thread_comments(p_question uuid default null, p_pair text default null)
returns table (id uuid, body text, created_at timestamptz, is_mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.body, c.created_at, coalesce(c.author_id = auth.uid(), false)
  from public.comments c
  where num_nonnulls(p_question, p_pair) = 1
    and (c.pair_id = p_pair
         or (c.question_id = p_question
             and exists (select 1 from public.user_questions q
                         where q.id = p_question
                           and (q.status = 'published' or q.author_id = auth.uid()))))
  order by c.created_at
$$;

-- Opens a share link. Anyone holding the code can see the question.
create or replace function public.open_share(p_code text)
returns table (pair_id text, question_id uuid, dog_photo_path text, owner_photo_path text,
               caption text, note text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.pair_id, s.question_id, q.dog_photo_path, q.owner_photo_path, q.caption, s.note
  from public.question_shares s
  left join public.user_questions q on q.id = s.question_id
  where s.share_code = p_code
    and (s.question_id is null or q.status = 'published')
$$;

-- Reveals the answer to a user question once someone has guessed.
create or replace function public.check_answer(p_question uuid, p_guess boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select q.is_match = p_guess
  from public.user_questions q
  where q.id = p_question and q.status = 'published'
$$;

-- Two scores per signed-in user. Sort it with PostgREST, for example
--   /rest/v1/rpc/community_leaderboard?order=correct.desc
--   /rest/v1/rpc/community_leaderboard?order=rating_avg.desc.nullslast,rating_count.desc
-- correct: correct answers from the linked game player.
-- rating_avg / rating_count: stars received across all of the user's published questions.
create or replace function public.community_leaderboard()
returns table (display_name text, correct int, rating_avg numeric, rating_count int,
               posts int, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name,
         coalesce(pl.correct, 0),
         round(avg(r.stars), 2),
         count(r.stars)::int,
         count(distinct q.id)::int,
         coalesce(p.id = auth.uid(), false)
  from public.profiles p
  left join public.players pl on pl.id = p.player_id
  left join public.user_questions q on q.author_id = p.id and q.status = 'published'
  left join public.question_ratings r on r.question_id = q.id
  where not p.is_banned
  group by p.id, p.display_name, pl.correct
$$;

-- Attaches the browser's anonymous game player to the signed-in user, so its
-- correct answers count on the community leaderboard. Needs the player key,
-- so nobody can claim another player's score.
create or replace function public.link_player(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h text := encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.players where id = p_id and secret_hash = h) then
    raise exception 'wrong player key';
  end if;
  update public.profiles set player_id = p_id where id = auth.uid();
end;
$$;

-- Admin-only: ban or unban a user. is_banned is not in any column grant, so
-- this is the only way to change it from the API.
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  update public.profiles set is_banned = p_banned where id = p_user;
end;
$$;

-- Function privileges: Postgres lets PUBLIC execute new functions, so revoke
-- that and grant per role.
revoke execute on function
  public.is_admin(), private.handle_new_user(), private.is_banned(),
  private.question_is_open(uuid), private.can_rate(uuid),
  public.question_feed(), public.thread_comments(uuid, text), public.open_share(text),
  public.check_answer(uuid, boolean), public.community_leaderboard(),
  public.link_player(uuid, text), public.admin_set_banned(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.question_feed(), public.thread_comments(uuid, text), public.open_share(text),
  public.check_answer(uuid, boolean), public.community_leaderboard()
to anon, authenticated;

grant execute on function
  public.is_admin(), private.is_banned(), private.question_is_open(uuid), private.can_rate(uuid),
  public.link_player(uuid, text), public.admin_set_banned(uuid, boolean)
to authenticated;
