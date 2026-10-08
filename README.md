# Who's Walking Who

Vite app. Leaderboard on Supabase (tables `players`, `breed_bests`, function `submit_game`),
hosted on Vercel. Public keys are in `src/config.js`.

- Local: `npm install && npm run dev`
- Real images: fill `IMAGE_OVERRIDES` at the top of `src/main.js` (keys like `golden-0-dog`, `golden-0-owner`).
- To update the live site from git, connect this folder's GitHub repo to the Vercel project `whos-walking-who`.
