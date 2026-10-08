// Supabase leaderboard over plain REST. Each browser gets a private player key;
// the server stores only its hash and checks it on every score submission.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const COLS = 'id,name,total,games,correct,answered,best,best_breed,streak';
const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
let who = null;

function identity() {
  let id = null, secret = null;
  try { id = localStorage.getItem('ww-pid'); secret = localStorage.getItem('ww-psecret'); } catch {}
  if (!id || !secret) {
    id = crypto.randomUUID();
    secret = crypto.randomUUID() + crypto.randomUUID();
    try { localStorage.setItem('ww-pid', id); localStorage.setItem('ww-psecret', secret); } catch {}
  }
  return { id, secret };
}

async function rest(path, init) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers, ...init });
  if (!res.ok) throw new Error('supabase ' + res.status);
  return res.status === 204 ? null : res.json();
}

const rowOf = p => ({
  id: p.id, name: p.name, total: p.total, games: p.games, correct: p.correct,
  answered: p.answered, best: p.best, bestBreed: p.best_breed, streak: p.streak, breeds: {}
});

export async function init() {
  who = identity();
  try {
    await rest('players?select=id&limit=1');
  } catch {
    return { ok: false, reason: 'The shared leaderboard could not be reached, so only your own stats are shown.' };
  }
  return { ok: true, uid: who.id, anonymous: true };
}

export async function fetchBoard() {
  const rows = await rest(`players?select=${COLS}&order=total.desc&limit=300`);
  return rows.map(rowOf);
}

export async function fetchBreed(breed) {
  const rows = await rest(
    `breed_bests?select=best,games,player:players(${COLS})&breed=eq.${encodeURIComponent(breed)}&order=best.desc&limit=100`
  );
  return rows.map(b => {
    const r = rowOf(b.player);
    r.breeds[breed] = { best: b.best, games: b.games };
    return r;
  });
}

export async function fetchMe() {
  const [p, bb] = await Promise.all([
    rest(`players?select=${COLS}&id=eq.${who.id}`),
    rest(`breed_bests?select=breed,best,games&player_id=eq.${who.id}`)
  ]);
  if (!p.length) return null;
  const me = rowOf(p[0]);
  bb.forEach(b => { me.breeds[b.breed] = { best: b.best, games: b.games }; });
  return me;
}

// Sends one finished game. The server adds it to the running totals.
export async function saveGame(game, name) {
  await rest('rpc/submit_game', {
    method: 'POST',
    body: JSON.stringify({
      p_id: who.id, p_secret: who.secret, p_name: name,
      p_breed: game.mode, p_score: game.score, p_correct: game.correct,
      p_answered: game.n, p_streak: game.streak
    })
  });
}

// Like counts for every round, plus the rounds this player has liked.
export async function fetchLikes() {
  const [counts, mine] = await Promise.all([
    rest('pair_like_counts?select=pair_id,likes'),
    rest(`pair_likes?select=pair_id&player_id=eq.${who.id}`)
  ]);
  const map = {};
  counts.forEach(c => { map[c.pair_id] = c.likes; });
  return { counts: map, mine: mine.map(m => m.pair_id) };
}

// Likes a round, or removes the like. Resolves true when the round is now liked.
export async function toggleLike(pair) {
  return rest('rpc/toggle_like', {
    method: 'POST',
    body: JSON.stringify({ p_id: who.id, p_secret: who.secret, p_pair: pair })
  });
}
