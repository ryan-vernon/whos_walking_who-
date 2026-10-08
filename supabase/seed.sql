-- Demo data for the community features. Run it in the Supabase SQL editor
-- (it runs as postgres, which bypasses RLS) after the migration.
-- Safe to run twice: every row has a fixed id and skips on conflict.
--
-- Five accounts. Their passwords are random and never printed, because this
-- seed also runs on the live project and a known password on the admin
-- account would hand anyone full access. To sign in as one, set a password
-- under Authentication > Users in the dashboard. To check what each one can
-- see without signing in, run tests/rls_checks.sql.
--   alice@example.com  Alice   2 published questions
--   ben@example.com    Ben     1 published, 1 hidden by the admin
--   chloe@example.com  Chloe   1 published
--   dev@example.com    Dev     1 published, banned (cannot post, comment or rate)
--   admin@example.com  Admin   app_metadata.role = 'admin', sees everything
--
-- Photo paths point at seed/... names that are not uploaded files, so the
-- rows are there to look at in the table editor, not to render in the game.

-- Auth users ----------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
       u.app_meta, jsonb_build_object('display_name', u.name), now(), now(),
       '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-00000000000a'::uuid, 'alice@example.com', 'Alice', '{"provider":"email","providers":["email"]}'::jsonb),
  ('b0000000-0000-4000-8000-00000000000b'::uuid, 'ben@example.com',   'Ben',   '{"provider":"email","providers":["email"]}'::jsonb),
  ('c0000000-0000-4000-8000-00000000000c'::uuid, 'chloe@example.com', 'Chloe', '{"provider":"email","providers":["email"]}'::jsonb),
  ('d0000000-0000-4000-8000-00000000000d'::uuid, 'dev@example.com',   'Dev',   '{"provider":"email","providers":["email"]}'::jsonb),
  ('e0000000-0000-4000-8000-00000000000e'::uuid, 'admin@example.com', 'Admin', '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb)
) as u(id, email, name, app_meta)
on conflict (id) do nothing;

-- Email identities, so the accounts can sign in with a password.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('alice@example.com', 'ben@example.com', 'chloe@example.com', 'dev@example.com', 'admin@example.com')
on conflict (provider_id, provider) do nothing;

-- Game players: the source of the "correct answers" score --------------------
-- Player key for each is 'seed-player-key-<name>', e.g. seed-player-key-alice.
insert into public.players (id, secret_hash, name, total, games, correct, answered, best, best_breed, streak)
select p.id, encode(sha256(convert_to('seed-player-key-' || lower(p.name), 'UTF8')), 'hex'),
       p.name, p.correct * 150, p.games, p.correct, p.games * 8, 1100, 'golden', 6
from (values
  ('a1000000-0000-4000-8000-00000000000a'::uuid, 'Alice', 34, 6),
  ('b1000000-0000-4000-8000-00000000000b'::uuid, 'Ben',   51, 8),
  ('c1000000-0000-4000-8000-00000000000c'::uuid, 'Chloe', 19, 4),
  ('d1000000-0000-4000-8000-00000000000d'::uuid, 'Dev',    8, 2)
) as p(id, name, correct, games)
on conflict (id) do nothing;

-- Profiles were created by the sign-up trigger; link players and ban Dev.
update public.profiles set player_id = 'a1000000-0000-4000-8000-00000000000a' where id = 'a0000000-0000-4000-8000-00000000000a';
update public.profiles set player_id = 'b1000000-0000-4000-8000-00000000000b' where id = 'b0000000-0000-4000-8000-00000000000b';
update public.profiles set player_id = 'c1000000-0000-4000-8000-00000000000c' where id = 'c0000000-0000-4000-8000-00000000000c';
update public.profiles set player_id = 'd1000000-0000-4000-8000-00000000000d', is_banned = true
  where id = 'd0000000-0000-4000-8000-00000000000d';

-- User questions --------------------------------------------------------------
insert into public.user_questions (id, author_id, dog_photo_path, owner_photo_path, is_match, caption, status, created_at)
values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'seed/alice-dog-1.jpg', 'seed/alice-owner-1.jpg', true,  'Biscuit and me after the beach', 'published', now() - interval '6 days'),
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'seed/alice-dog-2.jpg', 'seed/alice-owner-2.jpg', false, 'Is this my neighbour''s pug?',     'published', now() - interval '4 days'),
  ('10000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'seed/ben-dog-1.jpg',   'seed/ben-owner-1.jpg',   true,  'Same haircut, same attitude',      'published', now() - interval '5 days'),
  ('10000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-00000000000b', 'seed/ben-dog-2.jpg',   'seed/ben-owner-2.jpg',   false, 'Hidden by the admin',              'hidden',    now() - interval '3 days'),
  ('10000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-00000000000c', 'seed/chloe-dog-1.jpg', 'seed/chloe-owner-1.jpg', true,  'Two curly heads',                  'published', now() - interval '2 days'),
  ('10000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000d', 'seed/dev-dog-1.jpg',   'seed/dev-owner-1.jpg',   false, 'Guess who',                        'published', now() - interval '1 day')
on conflict (id) do nothing;

-- Ratings (stars received feed the second leaderboard score) ------------------
insert into public.question_ratings (question_id, user_id, stars)
values
  ('10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 5),
  ('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', 4),
  ('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000d', 5),
  ('10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b', 3),
  ('10000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000c', 4),
  ('10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', 4),
  ('10000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000c', 5),
  ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000a', 2),
  ('10000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', 5),
  ('10000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-00000000000b', 4),
  ('10000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-00000000000d', 3),
  ('10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000a', 1),
  ('10000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-00000000000b', 2)
on conflict (question_id, user_id) do nothing;

-- Comments, on built-in rounds (pair_id) and on user questions -----------------
insert into public.comments (id, author_id, question_id, pair_id, body, created_at)
values
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', null, 'golden-0', 'The hair gives it away every time.', now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b', null, 'golden-0', 'I still got this one wrong.', now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000c', null, 'pug-3', 'Matching scarves!', now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', null, 'Cutest pair on the board.', now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000001', null, 'Easy match, same smile.', now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', null, 'Ha, the haircut.', now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000005', null, 'Love the curls.', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000003', null, 'Comment from before Dev was banned.', now() - interval '2 days'),
  ('20000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000004', null, 'Admin note: hidden for duplicate photos.', now() - interval '2 days')
on conflict (id) do nothing;

-- Shares ----------------------------------------------------------------------
insert into public.question_shares (id, user_id, question_id, pair_id, share_code, note)
values
  ('30000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', null, 'demoalice001', 'You have to see this one'),
  ('30000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000c', null, 'husky-2', 'demohusky002', null),
  ('30000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000005', null, 'demochloe003', 'Curly twins')
on conflict (id) do nothing;
