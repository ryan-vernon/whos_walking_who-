-- Checks every RLS rule in the community migration against the seed data,
-- acting as anon, as ordinary users, as a banned user, and as the admin.
-- Paste into the Supabase SQL editor (or run with psql) after seed.sql.
-- Everything runs in one transaction and is rolled back, so it changes nothing.
-- Each check prints "ok: ..." as a notice; the first failure stops the run.
--
-- Impersonation is the same trick PostgREST uses: switch to the anon or
-- authenticated role and put the JWT claims in request.jwt.claims.

begin;

create function pg_temp.act_as(who text) returns void language plpgsql as $$
declare
  ids constant jsonb := '{"alice":"a0000000-0000-4000-8000-00000000000a",
                          "ben":"b0000000-0000-4000-8000-00000000000b",
                          "chloe":"c0000000-0000-4000-8000-00000000000c",
                          "dev":"d0000000-0000-4000-8000-00000000000d",
                          "admin":"e0000000-0000-4000-8000-00000000000e"}';
begin
  perform set_config('role', 'postgres', true);
  if who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', ids ->> who, 'role', 'authenticated',
      'app_metadata', case when who = 'admin' then '{"role":"admin"}'::jsonb else '{}'::jsonb end)::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

-- Rows a query returns, or rows a write statement touches.
create function pg_temp.n(q text) returns int language plpgsql as $$
declare c int;
begin
  if q ~* '^\s*select' then
    execute 'select count(*) from (' || q || ') s' into c;
  else
    execute q;
    get diagnostics c = row_count;
  end if;
  return c;
end $$;

-- True when the statement raises an error (permission denied, RLS violation...).
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end $$;

create function pg_temp.ok(label text, pass boolean) returns void language plpgsql as $$
begin
  if pass is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Two uploaded photos for Alice and one for Ben (normally the Storage API does this).
-- Supabase blocks SQL deletes on storage.objects (a trigger insists on the
-- Storage API), so the photo delete policies are not checked here.
insert into storage.objects (bucket_id, name, owner_id) values
  ('question-photos', 'uploads/alice-dog.jpg',   'a0000000-0000-4000-8000-00000000000a'),
  ('question-photos', 'uploads/alice-owner.jpg', 'a0000000-0000-4000-8000-00000000000a'),
  ('question-photos', 'uploads/ben-dog.jpg',     'b0000000-0000-4000-8000-00000000000b');

-- anon ------------------------------------------------------------------------
select pg_temp.act_as('anon');
select pg_temp.ok('anon cannot read profiles',        pg_temp.fails('select * from public.profiles'));
select pg_temp.ok('anon cannot read questions',       pg_temp.fails('select * from public.user_questions'));
select pg_temp.ok('anon cannot read comments',        pg_temp.fails('select * from public.comments'));
select pg_temp.ok('anon cannot read ratings',         pg_temp.fails('select * from public.question_ratings'));
select pg_temp.ok('anon cannot read shares',          pg_temp.fails('select * from public.question_shares'));
select pg_temp.ok('anon cannot comment',              pg_temp.fails($q$insert into public.comments (pair_id, body) values ('golden-0', 'hi')$q$));
select pg_temp.ok('anon sees 5 published questions in the feed', pg_temp.n('select * from public.question_feed()') = 5);
select pg_temp.ok('anon reads comments on a round',   pg_temp.n($q$select * from public.thread_comments(p_pair => 'golden-0')$q$) = 2);
select pg_temp.ok('anon gets no comments on a hidden question',
  pg_temp.n($q$select * from public.thread_comments('10000000-0000-4000-8000-000000000004')$q$) = 0);
select pg_temp.ok('anon opens a share link',          pg_temp.n($q$select * from public.open_share('demoalice001')$q$) = 1);
select pg_temp.ok('anon sees the leaderboard without banned users', pg_temp.n('select * from public.community_leaderboard()') = 4);
select pg_temp.ok('anon can check an answer',         (select public.check_answer('10000000-0000-4000-8000-000000000001', true)));
select pg_temp.ok('anon cannot link a player',        pg_temp.fails($q$select public.link_player('a1000000-0000-4000-8000-00000000000a', 'seed-player-key-alice')$q$));

-- alice: an ordinary user -----------------------------------------------------
select pg_temp.act_as('alice');
select pg_temp.ok('alice sees only her own profile',   pg_temp.n('select * from public.profiles') = 1);
select pg_temp.ok('alice sees only her 2 questions',   pg_temp.n('select * from public.user_questions') = 2);
select pg_temp.ok('alice sees only her 3 comments',    pg_temp.n('select * from public.comments') = 3);
select pg_temp.ok('alice sees only her 4 ratings',     pg_temp.n('select * from public.question_ratings') = 4);
select pg_temp.ok('alice sees only her 1 share',       pg_temp.n('select * from public.question_shares') = 1);
select pg_temp.ok('alice cannot list Ben''s comments', pg_temp.n($q$select * from public.comments where author_id = 'b0000000-0000-4000-8000-00000000000b'$q$) = 0);
select pg_temp.ok('alice cannot list Ben''s questions',pg_temp.n($q$select * from public.user_questions where author_id = 'b0000000-0000-4000-8000-00000000000b'$q$) = 0);
select pg_temp.ok('feed marks alice''s own questions',  pg_temp.n('select * from public.question_feed() where is_mine') = 2);
select pg_temp.ok('alice is not an admin',             not public.is_admin());

select pg_temp.ok('alice comments on a round',         pg_temp.n($q$insert into public.comments (pair_id, body) values ('beagle-1', 'new')$q$) = 1);
select pg_temp.ok('alice comments on Chloe''s question',
  pg_temp.n($q$insert into public.comments (question_id, body) values ('10000000-0000-4000-8000-000000000005', 'nice')$q$) = 1);
select pg_temp.ok('alice cannot comment on a hidden question',
  pg_temp.fails($q$insert into public.comments (question_id, body) values ('10000000-0000-4000-8000-000000000004', 'x')$q$));
select pg_temp.ok('alice cannot comment as Ben',
  pg_temp.fails($q$insert into public.comments (author_id, pair_id, body) values ('b0000000-0000-4000-8000-00000000000b', 'pug-1', 'x')$q$));
select pg_temp.ok('alice edits her own comment',
  pg_temp.n($q$update public.comments set body = 'edited' where id = '20000000-0000-4000-8000-000000000001'$q$) = 1);
select pg_temp.ok('alice cannot edit Ben''s comment (0 rows)',
  pg_temp.n($q$update public.comments set body = 'x' where id = '20000000-0000-4000-8000-000000000004'$q$) = 0);
select pg_temp.ok('alice cannot delete Ben''s comment (0 rows)',
  pg_temp.n($q$delete from public.comments where id = '20000000-0000-4000-8000-000000000004'$q$) = 0);
select pg_temp.ok('alice deletes her own comment',
  pg_temp.n($q$delete from public.comments where id = '20000000-0000-4000-8000-000000000007'$q$) = 1);

select pg_temp.ok('alice cannot rate her own question',
  pg_temp.fails($q$insert into public.question_ratings (question_id, stars) values ('10000000-0000-4000-8000-000000000001', 5)$q$));
select pg_temp.ok('alice changes her stars',
  pg_temp.n($q$update public.question_ratings set stars = 2 where question_id = '10000000-0000-4000-8000-000000000005'$q$) = 1);
select pg_temp.ok('alice cannot change Ben''s stars (0 rows)',
  pg_temp.n($q$update public.question_ratings set stars = 1 where user_id = 'b0000000-0000-4000-8000-00000000000b'$q$) = 0);
select pg_temp.ok('alice removes a rating',
  pg_temp.n($q$delete from public.question_ratings where question_id = '10000000-0000-4000-8000-000000000006'$q$) = 1);

select pg_temp.ok('alice posts a question with her own photos',
  pg_temp.n($q$insert into public.user_questions (dog_photo_path, owner_photo_path, is_match)
              values ('uploads/alice-dog.jpg', 'uploads/alice-owner.jpg', true)$q$) = 1);
select pg_temp.ok('alice cannot post with Ben''s photo',
  pg_temp.fails($q$insert into public.user_questions (dog_photo_path, owner_photo_path, is_match)
                 values ('uploads/ben-dog.jpg', 'uploads/alice-owner.jpg', true)$q$));
select pg_temp.ok('alice cannot post a photo that was never uploaded',
  pg_temp.fails($q$insert into public.user_questions (dog_photo_path, owner_photo_path, is_match)
                 values ('uploads/nope.jpg', 'uploads/alice-owner.jpg', true)$q$));
select pg_temp.ok('alice hides her own question',
  pg_temp.n($q$update public.user_questions set status = 'hidden' where id = '10000000-0000-4000-8000-000000000002'$q$) = 1);
select pg_temp.ok('alice cannot flip the answer after posting',
  pg_temp.fails($q$update public.user_questions set is_match = true where id = '10000000-0000-4000-8000-000000000002'$q$));
select pg_temp.ok('alice cannot unhide Ben''s question (0 rows)',
  pg_temp.n($q$update public.user_questions set status = 'published' where id = '10000000-0000-4000-8000-000000000004'$q$) = 0);

select pg_temp.ok('alice renames herself',
  pg_temp.n($q$update public.profiles set display_name = 'Alice B' where id = 'a0000000-0000-4000-8000-00000000000a'$q$) = 1);
select pg_temp.ok('alice cannot unban or ban herself',
  pg_temp.fails($q$update public.profiles set is_banned = false$q$));
select pg_temp.ok('alice cannot claim Ben''s game player without his key',
  pg_temp.fails($q$select public.link_player('b1000000-0000-4000-8000-00000000000b', 'guess')$q$));
select pg_temp.ok('alice links her game player with her key',
  not pg_temp.fails($q$select public.link_player('a1000000-0000-4000-8000-00000000000a', 'seed-player-key-alice')$q$));
select pg_temp.ok('alice cannot ban anyone',
  pg_temp.fails($q$select public.admin_set_banned('b0000000-0000-4000-8000-00000000000b', true)$q$));

select pg_temp.ok('alice shares Chloe''s question',
  pg_temp.n($q$insert into public.question_shares (question_id) values ('10000000-0000-4000-8000-000000000005')$q$) = 1);
select pg_temp.ok('alice cannot edit a share',
  pg_temp.fails($q$update public.question_shares set note = 'x'$q$));
select pg_temp.ok('alice cannot share a hidden question',
  pg_temp.fails($q$insert into public.question_shares (question_id) values ('10000000-0000-4000-8000-000000000004')$q$));

select pg_temp.ok('alice sees only her own uploads',  pg_temp.n($q$select * from storage.objects where bucket_id = 'question-photos'$q$) = 2);
select pg_temp.ok('alice uploads into uploads/',
  pg_temp.n($q$insert into storage.objects (bucket_id, name, owner_id) values ('question-photos', 'uploads/new.png', 'a0000000-0000-4000-8000-00000000000a')$q$) = 1);
select pg_temp.ok('alice cannot upload outside uploads/',
  pg_temp.fails($q$insert into storage.objects (bucket_id, name, owner_id) values ('question-photos', 'other/new.png', 'a0000000-0000-4000-8000-00000000000a')$q$));
select pg_temp.ok('alice cannot upload a non-image',
  pg_temp.fails($q$insert into storage.objects (bucket_id, name, owner_id) values ('question-photos', 'uploads/run.exe', 'a0000000-0000-4000-8000-00000000000a')$q$));

-- chloe ---------------------------------------------------------------------
select pg_temp.act_as('chloe');
select pg_temp.ok('chloe rates Dev''s question',
  pg_temp.n($q$insert into public.question_ratings (question_id, stars) values ('10000000-0000-4000-8000-000000000006', 4)$q$) = 1);
select pg_temp.ok('chloe cannot rate a hidden question',
  pg_temp.fails($q$insert into public.question_ratings (question_id, stars) values ('10000000-0000-4000-8000-000000000004', 5)$q$));
select pg_temp.ok('chloe cannot rate twice',
  pg_temp.fails($q$insert into public.question_ratings (question_id, stars) values ('10000000-0000-4000-8000-000000000001', 1)$q$));
select pg_temp.ok('chloe no longer sees the question Alice hid',
  pg_temp.n($q$select * from public.question_feed() where id = '10000000-0000-4000-8000-000000000002'$q$) = 0);

-- dev: a banned user (restrictive policies) -----------------------------------
select pg_temp.act_as('dev');
select pg_temp.ok('banned dev still reads his own comment', pg_temp.n('select * from public.comments') = 1);
select pg_temp.ok('banned dev cannot comment',
  pg_temp.fails($q$insert into public.comments (pair_id, body) values ('golden-1', 'spam')$q$));
select pg_temp.ok('banned dev cannot edit his comment (0 rows)',
  pg_temp.n($q$update public.comments set body = 'spam'$q$) = 0);
select pg_temp.ok('banned dev cannot rate',
  pg_temp.fails($q$insert into public.question_ratings (question_id, stars) values ('10000000-0000-4000-8000-000000000002', 1)$q$));
select pg_temp.ok('banned dev cannot upload photos',
  pg_temp.fails($q$insert into storage.objects (bucket_id, name, owner_id) values ('question-photos', 'uploads/d.png', 'd0000000-0000-4000-8000-00000000000d')$q$));
select pg_temp.ok('banned dev can still delete his own comment',
  pg_temp.n('delete from public.comments') = 1);

-- admin -----------------------------------------------------------------------
select pg_temp.act_as('admin');
select pg_temp.ok('admin is an admin',                   public.is_admin());
select pg_temp.ok('admin sees every profile',            pg_temp.n('select * from public.profiles') = 5);
select pg_temp.ok('admin sees every question, hidden too', pg_temp.n('select * from public.user_questions') = 7);
select pg_temp.ok('admin sees every comment',            pg_temp.n('select * from public.comments') = 9);
select pg_temp.ok('admin sees every rating',             pg_temp.n('select * from public.question_ratings') = 13);
select pg_temp.ok('admin sees every share',              pg_temp.n('select * from public.question_shares') = 4);
select pg_temp.ok('admin sees every upload',             pg_temp.n($q$select * from storage.objects where bucket_id = 'question-photos'$q$) = 4);
select pg_temp.ok('admin can list one user''s comments', pg_temp.n($q$select * from public.comments where author_id = 'b0000000-0000-4000-8000-00000000000b'$q$) = 2);
select pg_temp.ok('admin unhides Ben''s question',
  pg_temp.n($q$update public.user_questions set status = 'published' where id = '10000000-0000-4000-8000-000000000004'$q$) = 1);
select pg_temp.ok('admin deletes anyone''s comment',
  pg_temp.n($q$delete from public.comments where id = '20000000-0000-4000-8000-000000000004'$q$) = 1);
select pg_temp.ok('admin unbans dev',
  not pg_temp.fails($q$select public.admin_set_banned('d0000000-0000-4000-8000-00000000000d', false)$q$));

select pg_temp.act_as('dev');
select pg_temp.ok('unbanned dev can comment again',
  pg_temp.n($q$insert into public.comments (pair_id, body) values ('golden-1', 'back')$q$) = 1);

reset role;
select 'all checks passed' as result;
rollback;
