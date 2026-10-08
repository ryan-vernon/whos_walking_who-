# Community features and RLS

Files:

- `migrations/20261008130000_community_posts.sql` tables, grants, policies, storage bucket, functions
- `seed.sql` five demo accounts with posts, comments, ratings and shares
- `tests/rls_checks.sql` 74 checks that act as each role and roll back

## Applying it

The hosted project already has two migrations (`leaderboard_schema`, `pair_likes`) that are not in this repo, so
`supabase db push` will refuse until those are pulled. The simplest route is the SQL editor:

1. Run the migration file.
2. Run `seed.sql`.
3. Run `tests/rls_checks.sql`. Every line should print `ok: ...`; it changes nothing.
4. Make your own account an admin (sign out and in again afterwards so the token picks it up):
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   where email = 'you@example.com';
   ```

Seed accounts are alice, ben, chloe, dev (banned) and admin, each `@example.com`. Their passwords are random, since the seed runs on the live project; set one in Authentication > Users to sign in as them.

## Who can do what

| | anon | signed-in user | banned user | admin |
|---|---|---|---|---|
| Read base tables | no | own rows only | own rows only | every row |
| Feed, comments on a round or question, share links, leaderboard | yes, via functions, no author shown | same | same | same, plus the tables |
| Post a question | no | yes, with photos they uploaded | no | yes |
| Comment, rate, share | no | yes (no rating own posts, nothing on hidden posts) | no | yes |
| Edit | no | own comment text, own caption/status, own stars, own display name | own caption/status only | anything, through the admin policies |
| Delete | no | own rows | own rows | any row, any photo |
| Ban / unban | no | no | no | `admin_set_banned()` |

## Which RLS patterns this uses

| Pattern | Where |
|---|---|
| Default deny (RLS on, no policy for a role) | anon on every new table; UPDATE on `question_shares` |
| Owner policies with `auth.uid()` for SELECT, INSERT, UPDATE, DELETE | every table |
| `USING` vs `WITH CHECK` | UPDATE policies use both, so a row can't be moved to another owner |
| Admin from a JWT claim (`app_metadata.role`) and `FOR ALL` | `* : admin full access` |
| Permissive policies OR'ed together | owner policy OR admin policy |
| Restrictive policies AND'ed on top | `banned users cannot ...` |
| Cross-table checks in a policy | ratings and comments check the question is open |
| Security definer helpers to look past another table's RLS | `private.can_rate`, `private.question_is_open` |
| Policy that relies on another table's RLS | posting a question requires photos in `storage.objects` owned by you |
| Column-level GRANTs on writes | `author_id`, `is_match`, `is_banned` can't be written by users |
| Storage bucket policies | `question-photos`: upload folder, file types, owner/admin delete, no listing others' files |
| Security definer functions as the public read surface | `question_feed`, `thread_comments`, `open_share`, `community_leaderboard` |
| Trigger on `auth.users` | creates a profile on sign-up |
| `(select auth.uid())` wrapping and indexes on owner columns | performance |

## What it does not cover, and how you'd add it

1. **Supabase anonymous sign-ins.** The game uses its own player keys, not `signInAnonymously()`. With it, anonymous
   visitors get the `authenticated` role plus an `is_anonymous` claim, and you'd write a restrictive policy like
   `with check (not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false))` to keep them from posting.
2. **Roles from a table via a custom access token hook.** Admin here is a claim you set by hand. For several roles
   (moderator, admin), keep a `user_roles` table and add an Auth hook that copies the role into the JWT, then check
   `auth.jwt() ->> 'user_role'` in policies.
3. **The `service_role` (secret) key.** It bypasses RLS entirely. You'd only use it server-side, for example in an
   Edge Function that moderates uploads. Never ship it to the browser.
4. **MFA level.** A restrictive policy with `(auth.jwt() ->> 'aal') = 'aal2'` would require two-factor sign-in for,
   say, admin writes.
5. **Security invoker views.** This uses functions for the public feed. A view created `with (security_invoker = true)`
   applies the caller's RLS instead; a plain view runs as its owner and skips RLS, which the Supabase advisor flags.
6. **Time-limited policies.** For example, only allow editing a comment for 15 minutes:
   `using (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes')`.
7. **Group or team membership.** Policies like "members of the same club can see each other's posts" use
   `exists (select 1 from memberships ...)`, usually through a security definer helper to avoid recursion.
8. **Realtime authorization.** Live comment updates would need policies on `realtime.messages` for Broadcast and
   Presence channels; Postgres Changes already respect the table policies.
9. **`FORCE ROW LEVEL SECURITY`.** Table owners (postgres) skip RLS, which is why the seed works. `alter table ... force
   row level security` makes the owner obey it too.
10. **Column-level privacy on reads.** Writes are locked by column; reads go through functions instead. The existing
    `players` table shows the read version: `secret_hash` is left out of the SELECT grant.

## Not built yet

This is the database side only. The game still plays anonymously; using these features needs Supabase Auth
sign-in in the app, an upload form, comment and rating controls, and the leaderboard toggle.
