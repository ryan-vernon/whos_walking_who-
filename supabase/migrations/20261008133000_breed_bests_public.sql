-- The game reads breed_bests with the publishable (anon) key, but the read
-- policy only covered signed-in users, so the per-breed board came back empty.
alter policy "breed bests are public" on public.breed_bests to anon, authenticated;
