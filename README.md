# Who's Walking Who

Vite app. Leaderboard on Supabase (tables `players`, `breed_bests`, function `submit_game`),
plus community posts, comments, ratings and shares (see `supabase/RLS_GUIDE.md`),
hosted on Vercel. Public keys are in `src/config.js`.

- Local: `npm install && npm run dev`
- Real images: fill `IMAGE_OVERRIDES` at the top of `src/main.js` (keys like `golden-0-dog`, `golden-0-owner`).
- To update the live site from git, connect this folder's GitHub repo to the Vercel project `whos-walking-who`.
- Accounts use Supabase Auth (email and password). Signing in unlocks the Community tab (post a dog and owner,
  rate, comment, share), comments and sharing on game rounds, the community leaderboard, and the account page.
  Make an account an admin with the SQL in `supabase/RLS_GUIDE.md`; admins see every player's rows on the account page.
