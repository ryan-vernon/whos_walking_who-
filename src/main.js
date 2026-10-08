import './style.css';
import * as cloud from './cloud.js';

/* ---------- image slots ----------
 Put a real image URL (an uploaded asset or data: URI) here to replace any placeholder drawing.
 Keys look like "golden-0-dog" and "golden-0-owner" (breed id, pair number 0-7). */
const IMAGE_OVERRIDES = {};

/* ---------- data ---------- */
const COATS={
  cream:{fur:'#EBD9B0',ear:'#D8C08A',hair:'#E6C77A'}, golden:{fur:'#D9A048',ear:'#B87F2C',hair:'#C98F2E'},
  red:{fur:'#B5552B',ear:'#8E3D1B',hair:'#A8461F'}, black:{fur:'#2B2B31',ear:'#1A1A1F',hair:'#1D1D22'},
  chocolate:{fur:'#6B4229',ear:'#4E2E1B',hair:'#5A3720'}, white:{fur:'#F3F1EC',ear:'#D9D5CC',hair:'#E9E6E0'},
  gray:{fur:'#8C929B',ear:'#6C727B',hair:'#8A8F98'}, apricot:{fur:'#E8A97A',ear:'#CC8A5B',hair:'#D9905F'},
  fawn:{fur:'#C9A06B',ear:'#A97F4B',hair:'#B98B52'}, brindle:{fur:'#7B5A3C',ear:'#4F3823',hair:'#6E4E31'}
};
const HAIRTXT={long:'long and loose',wavy:'wavy',curly:'curly',bob:'a chin-length bob',spiky:'spiky',sleek:'slicked back',crop:'cropped short',mane:'a long mane with a white streak',bald:'bald on top with a full beard'};
const EARTXT={floppy:'floppy ears',long:'long droopy ears',pointy:'pointy ears',folded:'folded ears',rose:'small rose ears'};
const BREEDS=[
 {id:'golden',name:'Golden Retriever',group:'Sporting',ears:'floppy',snout:'mid',hair:'long',coats:['cream','golden','red','apricot']},
 {id:'poodle',name:'Poodle',group:'Non-sporting',ears:'floppy',snout:'long',hair:'curly',knot:true,coats:['white','black','apricot','gray']},
 {id:'beagle',name:'Beagle',group:'Hound',ears:'long',snout:'mid',hair:'bob',coats:['fawn','chocolate','brindle','cream']},
 {id:'dachshund',name:'Dachshund',group:'Hound',ears:'long',snout:'long',hair:'sleek',coats:['red','black','chocolate','cream']},
 {id:'pug',name:'Pug',group:'Toy',ears:'rose',snout:'short',mask:true,hair:'bald',coats:['fawn','black','apricot','gray']},
 {id:'corgi',name:'Corgi',group:'Herding',ears:'pointy',snout:'mid',hair:'spiky',coats:['red','fawn','apricot','cream']},
 {id:'husky',name:'Siberian Husky',group:'Working',ears:'pointy',snout:'mid',hair:'mane',coats:['gray','black','white','red']},
 {id:'lab',name:'Labrador',group:'Sporting',ears:'floppy',snout:'mid',hair:'crop',coats:['golden','black','chocolate','cream']},
 {id:'collie',name:'Border Collie',group:'Herding',ears:'folded',snout:'mid',hair:'wavy',coats:['black','chocolate','red','gray']},
 {id:'bulldog',name:'Bulldog',group:'Non-sporting',ears:'rose',snout:'short',mask:true,hair:'sleek',coats:['white','fawn','brindle','red']},
 {id:'schnauzer',name:'Schnauzer',group:'Terrier',ears:'folded',snout:'mid',beard:true,hair:'spiky',coats:['gray','black','white','brindle']},
 {id:'spaniel',name:'Cocker Spaniel',group:'Sporting',ears:'long',snout:'mid',hair:'wavy',coats:['golden','black','chocolate','red']},
 {id:'dane',name:'Great Dane',group:'Working',ears:'folded',snout:'long',hair:'crop',coats:['fawn','black','gray','brindle']}
];
const DOGS=['Biscuit','Waffles','Pepper','Mochi','Rocket','Clover','Otis','Juniper','Bear','Pickles','Willow','Ziggy','Maple','Tucker','Nova','Gizmo','Daisy','Rufus','Olive','Bandit','Penny','Chester','Sunny','Moose'];
const OWNERS=['Marcus','Dana','Priya','Tom','Lena','Omar','Grace','Diego','Hannah','Kofi','Ingrid','Sam','Yuki','Rosa','Ben','Amara','Nils','Carmen','Jo','Farid','Mei','Walt','Zara','Leo'];
const SKINS=['#F1C7A5','#E0A57C','#C68A5E','#A26A45','#7A4B2E','#F6D8C0'];
const SHIRTS=['#3E6DB5','#C2453D','#3C8D6B','#8B5CB0','#E0912F','#2F3A4A','#D0688F','#5A8A9A'];
const BGS=['#CFE3D6','#F4D9C4','#D5DDF2','#F2E2A8','#E3CFE8','#CBE6EA'];
const PAIRS=[];
BREEDS.forEach((b,bi)=>{for(let i=0;i<8;i++){const ck=b.coats[i%4];PAIRS.push({
  id:b.id+'-'+i,n:i,breed:b,coatKey:ck,coat:COATS[ck],variant:i>>2,
  dog:DOGS[(bi*8+i)%DOGS.length],owner:OWNERS[(bi*8+i)%OWNERS.length],
  skin:SKINS[(bi*3+i*5)%6],shirt:SHIRTS[(bi+i*3)%8],dogBg:BGS[(bi+i)%6],ownerBg:BGS[(bi+i+2)%6]});}});
const BY_ID=Object.fromEntries(BREEDS.map(b=>[b.id,b]));

/* ---------- helpers ---------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hex2rgb=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16))};
const mix=(a,b,t)=>{const A=hex2rgb(a),B=hex2rgb(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
const lum=h=>{const [r,g,b]=hex2rgb(h);return .299*r+.587*g+.114*b};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a};
const store={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};

/* ---------- placeholder art (drawn, not photographs) ---------- */
function dogArt(p){
  const b=p.breed,c=p.coat,fur=c.fur,ear=c.ear,muz=mix(fur,'#ffffff',.38);
  const patch=lum(fur)<70?'#EDE9E0':mix(fur,'#000000',.55);
  let ears='';
  if(b.ears==='floppy')ears=`<ellipse cx="50" cy="92" rx="19" ry="38" transform="rotate(12 50 92)" fill="${ear}"/><ellipse cx="150" cy="92" rx="19" ry="38" transform="rotate(-12 150 92)" fill="${ear}"/>`;
  if(b.ears==='long')ears=`<ellipse cx="50" cy="112" rx="17" ry="56" transform="rotate(8 50 112)" fill="${ear}"/><ellipse cx="150" cy="112" rx="17" ry="56" transform="rotate(-8 150 112)" fill="${ear}"/>`;
  if(b.ears==='pointy')ears=`<polygon points="54,72 64,10 104,54" fill="${ear}"/><polygon points="146,72 136,10 96,54" fill="${ear}"/><polygon points="64,60 68,28 86,52" fill="#E9B4A6"/><polygon points="136,60 132,28 114,52" fill="#E9B4A6"/>`;
  if(b.ears==='folded')ears=`<path d="M52 74 L58 26 Q86 28 102 54Z" fill="${ear}"/><path d="M148 74 L142 26 Q114 28 98 54Z" fill="${ear}"/>`;
  if(b.ears==='rose')ears=`<path d="M54 66 Q50 38 82 46 Q70 58 78 68Z" fill="${ear}"/><path d="M146 66 Q150 38 118 46 Q130 58 122 68Z" fill="${ear}"/>`;
  const sn={short:[24,15,118],mid:[27,19,120],long:[26,25,124]}[b.snout];
  const [rx,ry,cy]=sn,ny=cy-ry+5,my=cy-ry+12;
  const mask=b.mask?`<ellipse cx="100" cy="${cy-2}" rx="${rx+3}" ry="${ry+4}" fill="#3A2E29"/>`:'';
  const beard=b.beard?`<ellipse cx="100" cy="140" rx="25" ry="17" fill="${mix(fur,'#ffffff',.55)}"/><ellipse cx="80" cy="73" rx="12" ry="5" fill="${mix(fur,'#ffffff',.55)}"/><ellipse cx="120" cy="73" rx="12" ry="5" fill="${mix(fur,'#ffffff',.55)}"/>`:'';
  const knot=b.knot?`<circle cx="100" cy="44" r="21" fill="${fur}"/><circle cx="78" cy="54" r="15" fill="${fur}"/><circle cx="122" cy="54" r="15" fill="${fur}"/>`:'';
  const eye=x=>`<circle cx="${x}" cy="88" r="5.5" fill="#15151a"/><circle cx="${x+1.8}" cy="86" r="1.7" fill="#fff"/>`;
  return `<path d="M40 200 Q46 150 100 146 Q154 150 160 200Z" fill="${fur}"/>${ears}
  <ellipse cx="100" cy="96" rx="48" ry="44" fill="${fur}"/>${knot}
  ${p.variant?`<ellipse cx="78" cy="88" rx="17" ry="16" fill="${patch}"/>`:''}
  <ellipse cx="100" cy="${cy}" rx="${rx}" ry="${ry}" fill="${muz}"/>${mask}${beard}
  <ellipse cx="100" cy="${ny}" rx="9" ry="6" fill="#0d0d0f"/>
  <path d="M100 ${ny+5} V${my+2} M100 ${my+2} q-9 9 -17 2 M100 ${my+2} q9 9 17 2" stroke="#15151a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  ${eye(78)}${eye(122)}`;
}
function ownerArt(p){
  const b=p.breed,hc=p.coat.hair,st=b.hair,brow=mix(hc,'#000000',.3);
  let back='',front='',beard='';
  if(st==='long'||st==='mane')back=`<path d="M56 90 Q50 28 100 28 Q150 28 144 90 L152 172 Q100 184 48 172Z" fill="${hc}"/>`;
  if(st==='wavy')back=`<path d="M56 90 Q50 28 100 28 Q150 28 144 90 Q156 120 146 138 Q132 128 122 142 Q100 130 78 142 Q68 128 54 138 Q44 120 56 90Z" fill="${hc}"/>`;
  if(st==='curly')back=[[58,60,17],[80,42,18],[102,36,18],[124,42,18],[144,60,17],[50,88,15],[150,88,15],[54,112,13],[146,112,13]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`).join('');
  if(st==='bob')back=`<path d="M54 92 Q50 28 100 28 Q150 28 146 92 L146 128 Q100 138 54 128Z" fill="${hc}"/>`;
  const cap=`<path d="M62 84 Q58 38 100 38 Q142 38 138 84 Q126 60 100 58 Q74 60 62 84Z" fill="${hc}"/>`;
  if(st==='long'||st==='wavy'||st==='bob')front=cap;
  if(st==='mane')front=cap+`<path d="M95 38 H105 L107 66 H93Z" fill="#F1EFEA"/>`;
  if(st==='curly')front=[[74,54,12],[92,50,12],[110,50,12],[128,54,12]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`).join('');
  if(st==='spiky')front=`<path d="M62 82 L60 46 L76 58 L84 32 L98 54 L112 28 L120 54 L136 36 L138 62 L144 50 L138 84 Q100 58 62 82Z" fill="${hc}"/>`;
  if(st==='sleek')front=`<path d="M62 82 Q58 34 102 34 Q144 36 138 82 Q126 58 100 56 Q78 58 62 82Z" fill="${hc}"/>`;
  if(st==='crop')front=`<path d="M63 76 Q62 42 100 42 Q138 42 137 76 Q126 56 100 56 Q76 56 63 76Z" fill="${hc}"/>`;
  if(st==='bald')beard=`<path d="M64 100 Q64 148 100 152 Q136 148 136 100 Q124 124 100 124 Q76 124 64 100Z" fill="${hc}"/>`;
  const glasses=p.variant?`<circle cx="84" cy="92" r="12.5" fill="none" stroke="#1d1d22" stroke-width="3"/><circle cx="116" cy="92" r="12.5" fill="none" stroke="#1d1d22" stroke-width="3"/><path d="M96.5 92 H103.5" stroke="#1d1d22" stroke-width="3"/>`:'';
  return `${back}<path d="M30 200 Q36 150 100 146 Q164 150 170 200Z" fill="${p.shirt}"/>
  <rect x="88" y="118" width="24" height="34" rx="6" fill="${mix(p.skin,'#000000',.12)}"/>
  <circle cx="63" cy="96" r="7" fill="${p.skin}"/><circle cx="137" cy="96" r="7" fill="${p.skin}"/>
  <ellipse cx="100" cy="92" rx="37" ry="43" fill="${p.skin}"/>${beard}
  <circle cx="84" cy="92" r="4" fill="#1a1a1f"/><circle cx="116" cy="92" r="4" fill="#1a1a1f"/>
  <path d="M74 80 Q84 75 94 80 M106 80 Q116 75 126 80" stroke="${brow}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M100 96 V106" stroke="${mix(p.skin,'#000000',.2)}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M89 113 Q100 123 111 113" stroke="#7a2f2a" stroke-width="3" fill="none" stroke-linecap="round"/>${front}${glasses}`;
}
function art(p,kind,label){
  const key=p.id+'-'+kind,src=IMAGE_OVERRIDES[key];
  if(src)return `<img class="art" src="${esc(src)}" alt="${esc(label)}" style="object-fit:cover">`;
  const bg=kind==='dog'?p.dogBg:p.ownerBg;
  return `<svg class="art" viewBox="0 0 200 200" role="img" aria-label="${esc(label)}"><rect width="200" height="200" fill="${bg}"/>${kind==='dog'?dogArt(p):ownerArt(p)}</svg>`;
}
function cue(p){
  const b=p.breed,owner=b.hair==='bald'?`${p.coatKey} beard, ${HAIRTXT.bald}`:`${p.coatKey} hair, ${HAIRTXT[b.hair]}`;
  return `${p.dog}: ${p.coatKey} coat, ${EARTXT[b.ears]}${p.variant?', an eye patch':''}. ${p.owner}: ${owner}${p.variant?', round glasses':''}.`;
}

/* ---------- identity, stats, shared board (Supabase) ---------- */
let uid=null,rows=[],breedRows={},cloudOk=false,cloudNote='',anon=true;
let likeCounts={},myLikes=new Set();
const blank=()=>({name:'',total:0,games:0,correct:0,answered:0,best:0,bestBreed:'',streak:0,breeds:{}});
let me=Object.assign(blank(),(()=>{try{return JSON.parse(store.get('ww-stats')||'{}')}catch{return{}}})());
let playerName=store.get('ww-name')||'';
const ROUNDS=8,ROUND_SECS=15;
let S={screen:'play',query:'',g:null,sort:'total',boardBreed:'overall',last:null,saveMsg:''};

async function initCloud(){
  const r=await cloud.init();
  if(!r.ok){cloudNote=r.reason;render();return;}
  uid=r.uid;anon=r.anonymous;cloudOk=true;
  try{
    const m=await cloud.fetchMe();
    if(m&&m.games>me.games){me=Object.assign(blank(),m);store.set('ww-stats',JSON.stringify(me));}
    if(!playerName&&m&&m.name){playerName=m.name;store.set('ww-name',playerName);}
  }catch{}
  await syncLikes();
  await refreshBoard();
  render();
}
async function syncLikes(){
  try{const l=await cloud.fetchLikes();likeCounts=l.counts;myLikes=new Set(l.mine);}catch{}
}
async function toggleLike(pair){
  if(!cloudOk)return;
  const was=myLikes.has(pair);
  if(was){myLikes.delete(pair);likeCounts[pair]=Math.max(0,(likeCounts[pair]||1)-1);}
  else{myLikes.add(pair);likeCounts[pair]=(likeCounts[pair]||0)+1;}
  render();
  try{
    const liked=await cloud.toggleLike(pair);
    if(liked!==myLikes.has(pair)){await syncLikes();render();}
  }catch{
    if(was){myLikes.add(pair);likeCounts[pair]=(likeCounts[pair]||0)+1;}
    else{myLikes.delete(pair);likeCounts[pair]=Math.max(0,(likeCounts[pair]||1)-1);}
    render();
  }
}
async function refreshBoard(){
  if(!cloudOk)return;
  try{
    rows=await cloud.fetchBoard();
    if(S.screen==='board')syncLikes();
    const bb=S.boardBreed;
    if(bb!=='overall')breedRows[bb]=await cloud.fetchBreed(bb);
    cloudNote='';
  }catch{cloudNote='The shared leaderboard could not be reached, so only your own stats are shown.';}
  if(S.screen==='board')render();
}
setInterval(()=>{if(S.screen==='board')refreshBoard();},30000);
async function saveMe(){
  me.name=(playerName||'Player').slice(0,20);
  store.set('ww-stats',JSON.stringify(me));
  if(!cloudOk){S.saveMsg='Saved on this device only. The shared leaderboard is not connected.';return;}
  try{await cloud.saveGame(S.last,me.name);S.saveMsg='Posted to the leaderboard.';refreshBoard();}
  catch{S.saveMsg='Could not post to the leaderboard. Your stats are saved on this device.';}
}

/* ---------- game ---------- */
function startGame(mode){
  let picks;
  if(mode==='all'){picks=shuffle(PAIRS).slice(0,ROUNDS);}
  else picks=shuffle(PAIRS.filter(p=>p.breed.id===mode)).slice(0,ROUNDS);
  const rounds=picks.map(t=>{
    const pool=PAIRS.filter(p=>p.id!==t.id&&(mode==='all'||p.breed.id===t.breed.id));
    return {pair:t,opts:shuffle([t,...shuffle(pool).slice(0,3)])};
  });
  S.g={mode,rounds,i:0,score:0,correct:0,streak:0,bestStreak:0,times:[],pick:null,gain:0,t0:Date.now(),left:ROUND_SECS};
  S.screen='game';S.last=null;render();startTimer();
}
let timer=null;
function startTimer(){
  clearInterval(timer);const g=S.g;g.t0=Date.now();
  timer=setInterval(()=>{
    if(!S.g||S.g.pick!==null){clearInterval(timer);return;}
    const el=(Date.now()-S.g.t0)/1000;S.g.left=Math.max(0,ROUND_SECS-el);
    const bar=document.querySelector('.timer i'),wrap=document.querySelector('.timer');
    if(bar){bar.style.width=(S.g.left/ROUND_SECS*100)+'%';wrap.classList.toggle('low',S.g.left<4);}
    const t=document.getElementById('secs');if(t)t.textContent=Math.ceil(S.g.left)+'s';
    if(S.g.left<=0)answer(-1);
  },100);
}
function answer(idx){
  const g=S.g;if(!g||g.pick!==null)return;
  clearInterval(timer);
  const r=g.rounds[g.i],secs=Math.min(ROUND_SECS,(Date.now()-g.t0)/1000);
  g.pick=idx;g.times.push(secs);
  const ok=idx>=0&&r.opts[idx].id===r.pair.id;
  if(ok){g.streak++;g.bestStreak=Math.max(g.bestStreak,g.streak);
    g.gain=100+Math.round(50*Math.max(0,ROUND_SECS-secs)/ROUND_SECS)+Math.min(g.streak,5)*10;
    g.score+=g.gain;g.correct++;}
  else{g.streak=0;g.gain=0;}
  render();
}
function next(){
  const g=S.g;if(!g||g.pick===null)return;
  if(g.i+1>=g.rounds.length){finish();return;}
  g.i++;g.pick=null;g.gain=0;render();startTimer();
}
async function finish(){
  const g=S.g;
  me.total+=g.score;me.games++;me.correct+=g.correct;me.answered+=g.rounds.length;
  me.streak=Math.max(me.streak,g.bestStreak);
  if(g.score>me.best){me.best=g.score;me.bestBreed=g.mode;}
  const bk=g.mode,cur=me.breeds[bk]||{best:0,games:0};
  me.breeds[bk]={best:Math.max(cur.best,g.score),games:cur.games+1};
  S.last={score:g.score,correct:g.correct,n:g.rounds.length,mode:g.mode,streak:g.bestStreak,avg:g.times.reduce((a,b)=>a+b,0)/g.times.length};
  S.screen='result';S.saveMsg='Saving your score...';S.g=null;render();
  await saveMe();if(S.screen==='result')render();
}

/* ---------- views ---------- */
const modeName=m=>m==='all'?'All breeds':BY_ID[m].name;
function viewPlay(){
  const q=S.query.trim().toLowerCase();
  const list=BREEDS.filter(b=>!q||b.name.toLowerCase().includes(q)||b.group.toLowerCase().includes(q));
  const showMixed=!q||'all breeds mixed'.includes(q);
  const pb=id=>{const x=me.breeds[id];return x?`Best ${x.best}`:'Not played';};
  const mixed=showMixed?`<button class="tile mixed" data-act="start" data-v="all"><span class="art">${[PAIRS[0],PAIRS[24],PAIRS[48],PAIRS[72]].map(p=>art(p,'dog','')).join('')}</span><span class="meta"><b>All breeds</b><small>Mixed bag, 8 rounds</small><span class="pb">${pb('all')}</span></span></button>`:'';
  const tiles=list.map(b=>{const p=PAIRS.find(x=>x.breed.id===b.id);return `<button class="tile" data-act="start" data-v="${b.id}"><span class="art">${art(p,'dog',b.name)}</span><span class="meta"><b>${esc(b.name)}</b><small>${esc(b.group)} group</small><span class="pb">${pb(b.id)}</span></span></button>`;}).join('');
  return `<section class="hero"><h1>Match each dog to the owner who looks just like them.</h1>
  <p>Pick a breed, then spot the person who shares the dog's coat, ears and attitude. ${ROUNDS} rounds, ${ROUND_SECS} seconds each. Faster answers and streaks score more.</p></section>
  <div class="setup">
    <div class="field"><label for="pname">Your name</label><input id="pname" maxlength="20" autocomplete="nickname" placeholder="Shown on the leaderboard" value="${esc(playerName)}"></div>
    <div class="field"><label for="q">Search breeds</label><input id="q" type="search" placeholder="Try poodle, hound, or herding" value="${esc(S.query)}" autocomplete="off"></div>
  </div>
  <div class="grid" id="grid">${mixed}${tiles||(showMixed?'':'')}${(!tiles&&!mixed)?`<div class="empty">No breeds match "${esc(S.query)}". Try a group like sporting, hound or terrier.</div>`:''}</div>
  <p class="note">All dog and owner pictures are placeholder drawings for now. Real images can be dropped in later without changing the game.</p>`;
}
function viewGame(){
  const g=S.g,r=g.rounds[g.i],p=r.pair,done=g.pick!==null,ok=done&&g.pick>=0&&r.opts[g.pick].id===p.id;
  const opts=r.opts.map((o,i)=>{
    let cls='opt',label=`Owner option ${i+1}`;
    if(done){if(o.id===p.id)cls+=' right';else if(i===g.pick)cls+=' wrong';else cls+=' dim';}
    return `<button class="${cls}" data-act="pick" data-v="${i}" ${done?'disabled':''} aria-label="${label}">${art(o,'owner',label)}<span class="key">${i+1}</span><span class="who">${done?esc(o.owner):'&nbsp;'}</span></button>`;}).join('');
  let fb='';
  if(done){
    const head=ok?`<strong class="good">Match! +${g.gain}</strong>`:g.pick<0?`<strong class="bad">Time's up.</strong>`:`<strong class="bad">Not quite.</strong>`;
    const liked=myLikes.has(p.id),n=likeCounts[p.id]||0;
    const likeBtn=cloudOk?`<button class="like${liked?' on':''}" id="likebtn" data-act="like" data-v="${p.id}" aria-pressed="${liked}" aria-label="${liked?'Unlike':'Like'} this round, ${n} ${n===1?'like':'likes'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span class="mono">${n}</span></button>`:'';
    fb=`<div class="feedback" role="status"><p>${head} ${esc(p.dog)} walks with ${esc(p.owner)}. ${esc(cue(p))}</p><div class="fb-actions">${likeBtn}<button class="btn" data-act="next" id="nextbtn">${g.i+1>=g.rounds.length?'See results':'Next dog'}</button></div></div>`;
  }
  return `<div class="hud"><span class="crumb">${esc(modeName(g.mode))} &middot; Round ${g.i+1} of ${g.rounds.length}</span>
    <span class="stats"><span>Score <b>${g.score}</b></span><span>Streak <b>${g.streak}</b></span><span>Time <b id="secs">${Math.ceil(g.left)}s</b></span></span></div>
    <div class="timer" role="presentation"><i style="width:${done?0:g.left/ROUND_SECS*100}%"></i></div>
    <div class="stage">
      <figure class="dogcard" style="margin:0">${art(p,'dog',p.dog+', a '+p.breed.name)}<figcaption><b>${esc(p.dog)}</b><span>${esc(p.breed.name)}</span></figcaption></figure>
      <div><h2 class="prompt">Which owner belongs to ${esc(p.dog)}?</h2><div class="opts">${opts}</div>${fb}</div>
    </div>`;
}
function rankOf(){
  const all=rows.length?rows.slice():[{id:uid||'me',...me}];
  if(!all.some(r=>r.id===(uid||'me')))all.push({id:uid||'me',...me});
  all.sort((a,b)=>(b.total||0)-(a.total||0));
  return all.findIndex(r=>r.id===(uid||'me'))+1;
}
function viewResult(){
  const l=S.last,acc=Math.round(l.correct/l.n*100);
  const pbGame=me.breeds[l.mode]&&me.breeds[l.mode].best===l.score&&l.score>0;
  return `<section class="result"><p class="sub">${esc(modeName(l.mode))}</p><div class="big mono">${l.score}</div>
  <p class="sub">${pbGame?'A new personal best in this category.':'points this game'}</p>
  <div class="chips"><div class="chip">Correct<b>${l.correct}/${l.n}</b></div><div class="chip">Accuracy<b>${acc}%</b></div><div class="chip">Avg time<b>${l.avg.toFixed(1)}s</b></div><div class="chip">Best streak<b>${l.streak}</b></div><div class="chip">Rank<b>#${rankOf()}</b></div></div>
  <div class="actions"><button class="btn" data-act="start" data-v="${l.mode}">Play again</button><button class="btn ghost" data-act="tab" data-v="play">Pick another breed</button><button class="btn ghost" data-act="tab" data-v="board">Leaderboard</button></div>
  <p class="saved">${esc(S.saveMsg)}</p></section>`;
}
function viewBoard(){
  const id=uid||'me';
  const bb=S.boardBreed;
  let list=(bb==='overall'?rows:(breedRows[bb]||[])).map(r=>({...r}));
  const mineIdx=list.findIndex(r=>r.id===id);
  if(mineIdx<0&&me.games>0)list.push({id,...me});
  else if(mineIdx>=0&&me.games>(list[mineIdx].games||0))list[mineIdx]={id,...me};
  const metric=r=>{
    if(bb!=='overall'){const x=(r.breeds||{})[bb];return x?x.best:-1;}
    if(S.sort==='best')return r.best||0;
    if(S.sort==='acc')return (r.answered||0)>=ROUNDS?r.correct/r.answered:-1;
    return r.total||0;};
  list=list.filter(r=>metric(r)>=0&&(r.games||0)>0).sort((a,b)=>metric(b)-metric(a)||(b.total||0)-(a.total||0));
  const fmt=r=>{const m=metric(r);return S.sort==='acc'&&bb==='overall'?Math.round(m*100)+'%':String(m);};
  const unit=bb!=='overall'?'best game':S.sort==='total'?'total pts':S.sort==='best'?'best game':'accuracy';
  const body=list.map((r,i)=>{
    const acc=r.answered?Math.round(r.correct/r.answered*100):0,isMe=r.id===id;
    return `<li class="row ${isMe?'me':''}"><span class="rank ${i===0?'r1':''}">${i+1}</span>
    <span class="who2"><b>${esc(r.name||'Player')}${isMe?'<span class="tag">You</span>':''}</b><span>${r.games||0} games &middot; ${acc}% correct &middot; streak ${r.streak||0}</span></span>
    <span class="val">${fmt(r)}<small>${unit}</small></span></li>`;}).join('');
  const banner=!cloudOk?`<div class="banner">${esc(cloudNote||'The shared leaderboard is not connected. You are seeing your own stats only.')}</div>`:cloudNote?`<div class="banner">${esc(cloudNote)}</div>`:'';
  return `<section class="hero"><h1>Leaderboard</h1><p>Everyone who plays shows up here. Share the link with friends and see who knows dogs best. Your scores follow this browser, so clearing site data starts you fresh.</p></section>
  ${banner}
  <div class="ctrls"><div class="field"><label>Rank by</label><div class="seg" role="group" aria-label="Rank by">
    ${[['total','Total points'],['best','Best game'],['acc','Accuracy']].map(([k,t])=>`<button data-act="sort" data-v="${k}" aria-pressed="${S.sort===k&&bb==='overall'}">${t}</button>`).join('')}</div></div>
    <div class="field"><label for="bb">Breed</label><select id="bb"><option value="overall">Overall</option><option value="all" ${bb==='all'?'selected':''}>All breeds (mixed)</option>${BREEDS.map(b=>`<option value="${b.id}" ${bb===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
    ${me.games?`<button class="btn ghost" data-act="copy" id="copybtn">Copy my stats</button>`:''}<button class="btn ghost" data-act="refresh">Refresh</button></div>
  ${list.length?`<ol class="board">${body}</ol>`:`<div class="empty">No scores here yet. Play a round and be the first on the board.</div>`}`;
}
function render(){
  const app=document.getElementById('app');
  const focusId=document.activeElement&&document.activeElement.id;
  const sel=document.activeElement&&document.activeElement.selectionStart;
  app.innerHTML=S.screen==='play'?viewPlay():S.screen==='game'?viewGame():S.screen==='result'?viewResult():viewBoard();
  document.getElementById('tab-play').setAttribute('aria-current',S.screen!=='board'?'page':'false');
  document.getElementById('tab-board').setAttribute('aria-current',S.screen==='board'?'page':'false');
  if(focusId==='q'){const q=document.getElementById('q');if(q){q.focus();try{q.setSelectionRange(sel,sel)}catch{}}}
  if(focusId==='likebtn'){const l=document.getElementById('likebtn');if(l)l.focus();return;}
  if(S.screen==='game'&&S.g.pick!==null){const n=document.getElementById('nextbtn');if(n)n.focus();}
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;
  const a=t.dataset.act,v=t.dataset.v;
  if(a==='tab'){clearInterval(timer);S.g=null;S.screen=v;render();window.scrollTo(0,0);if(v==='board')refreshBoard();}
  else if(a==='start')startGame(v);
  else if(a==='pick')answer(+v);
  else if(a==='next')next();
  else if(a==='sort'){S.sort=v;S.boardBreed='overall';render();}
  else if(a==='refresh')refreshBoard();
  else if(a==='like')toggleLike(v);
  else if(a==='copy'){
    const acc=me.answered?Math.round(me.correct/me.answered*100):0;
    const txt=`My Who's Walking Who stats: ${me.total} points over ${me.games} games, ${acc}% correct, best game ${me.best}. Can you beat me?`;
    const btn=t;
    (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>{btn.textContent='Copied'},()=>{btn.textContent='Copy not available'});
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='q'){S.query=e.target.value;render();}
  if(e.target.id==='pname'){playerName=e.target.value.slice(0,20);store.set('ww-name',playerName);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='bb'){S.boardBreed=e.target.value;render();refreshBoard();}
});
document.addEventListener('keydown',e=>{
  if(S.screen!=='game'||!S.g||e.target.tagName==='INPUT')return;
  const g=S.g;
  if(g.pick===null&&/^[1-4]$/.test(e.key))answer(+e.key-1);
  else if(g.pick!==null&&e.key==='Enter'&&document.activeElement.id!=='nextbtn')next();
});

render();
initCloud();
