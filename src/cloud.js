// Supabase leaderboard over plain REST. Each browser gets a private player key;
// the server stores only its hash and checks it on every score submission.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const COLS = 'id,name,total,games,correct,answered,best,best_breed,streak';
const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
let who = null;
let session = null;
try { session = JSON.parse(localStorage.getItem('ww-session') || 'null'); } catch {}

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

// Signed-in requests carry the user's access token, so RLS sees auth.uid().
// Signed-out requests carry only the publishable key and run as anon.
async function authHeaders(extra) {
  const h = { ...headers, ...extra };
  const s = await freshSession();
  if (s) h.Authorization = 'Bearer ' + s.access_token;
  return h;
}

async function rest(path, init = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { ...init, headers: await authHeaders(init.headers) });
  if (!res.ok) throw new Error(await errorText(res));
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function errorText(res) {
  try {
    const j = await res.json();
    return j.message || j.msg || j.error_description || j.error || 'supabase ' + res.status;
  } catch { return 'supabase ' + res.status; }
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

/* ---------- Supabase Auth (email + password) ---------- */

function saveSession(s) {
  session = s && s.access_token ? { ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) } : null;
  try { session ? localStorage.setItem('ww-session', JSON.stringify(session)) : localStorage.removeItem('ww-session'); } catch {}
}

async function auth(path, body) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/' + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

// Refreshes the access token a minute before it expires.
async function freshSession() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session;
  try { saveSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
  catch { saveSession(null); }
  return session;
}

function claims() {
  if (!session) return null;
  try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; }
}

// Who is signed in, from the access token. isAdmin only decides what the app
// shows; the database checks the same claim itself in every admin policy.
export function currentUser() {
  const c = claims();
  if (!c) return null;
  return { id: c.sub, email: c.email, isAdmin: (c.app_metadata || {}).role === 'admin' };
}

export async function signIn(email, password) {
  saveSession(await auth('token?grant_type=password', { email, password }));
  return currentUser();
}

// Returns the user when signed in straight away, or null when the project
// asks people to confirm their email first.
export async function signUp(email, password, displayName) {
  const r = await auth('signup', { email, password, data: { display_name: displayName } });
  if (r.access_token) { saveSession(r); return currentUser(); }
  return null;
}

export async function signOut() {
  const s = session;
  saveSession(null);
  if (s) fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { ...headers, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
}

/* ---------- profile ---------- */

export async function fetchProfile() {
  const u = currentUser();
  if (!u) return null;
  const rows = await rest(`profiles?select=id,display_name,player_id,is_banned&id=eq.${u.id}`);
  return rows[0] || null;
}

export async function renameMe(name) {
  const u = currentUser();
  await rest(`profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ display_name: name }) });
}

// Counts this browser's game scores toward the signed-in account.
export async function linkPlayer() {
  await rest('rpc/link_player', { method: 'POST', body: JSON.stringify({ p_id: who.id, p_secret: who.secret }) });
}

/* ---------- photos (Storage) ---------- */

export const photoUrl = path => `${SUPABASE_URL}/storage/v1/object/public/question-photos/${path}`;

// Files are named by a random id so the URL never says who uploaded them.
async function uploadPhoto(file) {
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
  if (!ext) throw new Error('Photos must be JPG, PNG or WebP.');
  const path = `uploads/${crypto.randomUUID()}.${ext}`;
  const s = await freshSession();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/question-photos/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error(await errorText(res));
  return path;
}

/* ---------- community questions ---------- */

export const fetchFeed = () => rest('rpc/question_feed');

export async function postQuestion(dogFile, ownerFile, isMatch, caption) {
  const [dog, owner] = await Promise.all([uploadPhoto(dogFile), uploadPhoto(ownerFile)]);
  await rest('user_questions', {
    method: 'POST',
    body: JSON.stringify({ dog_photo_path: dog, owner_photo_path: owner, is_match: isMatch, caption: caption || null })
  });
}

export const checkAnswer = (id, guess) =>
  rest('rpc/check_answer', { method: 'POST', body: JSON.stringify({ p_question: id, p_guess: guess }) });

// First rating inserts a row; changing it updates only the stars column.
export async function rate(id, stars, hadRating) {
  if (hadRating) {
    await rest(`question_ratings?question_id=eq.${id}&user_id=eq.${currentUser().id}`, { method: 'PATCH', body: JSON.stringify({ stars }) });
  } else {
    await rest('question_ratings', { method: 'POST', body: JSON.stringify({ question_id: id, stars }) });
  }
}

/* ---------- comments (on a round or a community question) ---------- */

export const fetchComments = target =>
  rest('rpc/thread_comments', { method: 'POST', body: JSON.stringify(target.pair ? { p_pair: target.pair } : { p_question: target.question }) });

export const addComment = (target, body) =>
  rest('comments', { method: 'POST', body: JSON.stringify(target.pair ? { pair_id: target.pair, body } : { question_id: target.question, body }) });

export const editComment = (id, body) =>
  rest(`comments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ body }) });

export const deleteComment = id => rest(`comments?id=eq.${id}`, { method: 'DELETE' });

/* ---------- shares ---------- */

// Returns the new share code.
export async function share(target) {
  const rows = await rest('question_shares?select=share_code', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(target.pair ? { pair_id: target.pair } : { question_id: target.question })
  });
  return rows[0].share_code;
}

export async function openShare(code) {
  const rows = await rest('rpc/open_share', { method: 'POST', body: JSON.stringify({ p_code: code }) });
  return rows[0] || null;
}

/* ---------- the signed-in user's own rows ---------------------------------
   These read the tables directly. RLS returns only the caller's rows, or
   every row for an admin, so the same query powers "My stuff" and the admin
   panel. */

export async function fetchMine() {
  const [questions, comments, ratings, shares] = await Promise.all([
    rest('user_questions?select=id,author_id,dog_photo_path,owner_photo_path,is_match,caption,status,created_at&order=created_at.desc'),
    rest('comments?select=id,author_id,question_id,pair_id,body,created_at&order=created_at.desc'),
    rest('question_ratings?select=question_id,user_id,stars,created_at&order=created_at.desc'),
    rest('question_shares?select=id,user_id,question_id,pair_id,share_code,note,created_at&order=created_at.desc')
  ]);
  return { questions, comments, ratings, shares };
}

export const fetchProfiles = () => rest('profiles?select=id,display_name,is_banned,player_id&order=display_name');

export const setQuestionStatus = (id, status) =>
  rest(`user_questions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const deleteQuestion = id => rest(`user_questions?id=eq.${id}`, { method: 'DELETE' });
export const deleteRating = (qid, uid) => rest(`question_ratings?question_id=eq.${qid}&user_id=eq.${uid}`, { method: 'DELETE' });
export const deleteShare = id => rest(`question_shares?id=eq.${id}`, { method: 'DELETE' });

export const setBanned = (userId, banned) =>
  rest('rpc/admin_set_banned', { method: 'POST', body: JSON.stringify({ p_user: userId, p_banned: banned }) });

/* ---------- community leaderboard ---------- */

export const fetchCommunityBoard = sort =>
  rest('rpc/community_leaderboard?' + (sort === 'rating'
    ? 'order=rating_avg.desc.nullslast,rating_count.desc'
    : 'order=correct.desc,rating_avg.desc.nullslast'));
