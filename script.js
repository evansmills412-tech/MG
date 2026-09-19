// ===================== JavaScript: all the app logic =====================
(() => {
'use strict';

/* ---------- settings ---------- */
const SUBJECTS = ['Math','Science','English','History','Languages','Computer science','Other'];
const LEVELS   = ['Elementary','Middle school','High school','University','Other'];
const LIMITS   = { title:140, body:4000, answer:5000, note:600 };
const HIDE_AFTER = 3;            // reports before an item is hidden
const SYMBOLS = [['²','Squared'],['³','Cubed'],['√','Square root'],['π','Pi'],['±','Plus or minus'],['×','Times'],['÷','Divided by'],['≤','Less than or equal to'],['≥','Greater than or equal to'],['≠','Not equal to'],['∞','Infinity'],['∑','Sum'],['∫','Integral'],['°','Degrees'],['θ','Theta'],['Δ','Delta'],['→','Arrow']];

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const countTrue = (obj, skip) => obj ? Object.entries(obj).filter(([k, v]) => v === true && k !== skip).length : 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* frag(): turns strings, nodes, arrays and nulls into a fragment (native append would print "null") */
function frag(...kids){
  const f = document.createDocumentFragment();
  const add = k => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(x => add(x)); else f.append(k instanceof Node ? k : document.createTextNode(String(k))); };
  kids.forEach(add);
  return f;
}
function h(tag, props, ...kids){
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)){
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'hidden' || k === 'disabled' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(frag(kids));
  return el;
}

const timeAgo = ms => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60; if (m < 60) return Math.floor(m) + ' min ago';
  const hr = m / 60; if (hr < 24) return Math.floor(hr) + ' h ago';
  const d = hr / 24; if (d < 30) return Math.floor(d) + ' d ago';
  return new Date(ms).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
};

const svgAvatar = (name, color = '#2B55E0') => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="${color}"/><text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff">${esc(((name || '?').trim().charAt(0) || '?').toUpperCase())}</text></svg>`);

/* Turns plain text into safe formatted HTML: steps, superscripts, square roots. Text is escaped first. */
function rich(text){
  return String(text).replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map(p => {
    const lines = p.split('\n').map(line => {
      let t = esc(line);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\^\{([^}]{1,24})\}/g, '<sup>$1</sup>').replace(/\^(-?\d+|[A-Za-z])/g, '<sup>$1</sup>');
      t = t.replace(/_\{([^}]{1,24})\}/g, '<sub>$1</sub>').replace(/_(\d+)/g, '<sub>$1</sub>');
      t = t.replace(/sqrt\(/gi, '√(').replace(/&lt;=/g, '≤').replace(/&gt;=/g, '≥').replace(/!=/g, '≠').replace(/\+-/g, '±').replace(/-&gt;/g, '→').replace(/\bpi\b/g, 'π');
      t = t.replace(/^((?:step\s*)?\d+[.):])\s+/i, '<span class="stepno">$1</span> ');
      return t;
    });
    return '<p>' + lines.join('<br>') + '</p>';
  }).join('');
}

/* ---------- toast, confirm, lightbox ---------- */
let toastTimer;
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}
function errMsg(e){
  const c = e && e.code;
  if (c === 'quota_exceeded') return 'The board is full. Ask the owner to delete old questions.';
  if (c === 'invalid_argument') return "You can't change this. You may have view-only access.";
  if (c === 'resource_exhausted' || c === 'rate_limited') return 'Too many actions at once. Wait a moment and try again.';
  if (e && e.message === 'image') return "That photo couldn't be read. Try a JPG or PNG.";
  return "Couldn't save that. Check your connection and try again.";
}
function confirmDialog(title, body, action, danger){
  return new Promise(res => {
    const d = $('#dlg');
    $('#dlgTitle').textContent = title; $('#dlgBody').textContent = body;
    const ok = $('#dlgOk'); ok.textContent = action; ok.className = 'btn ' + (danger ? 'danger' : 'primary');
    d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once:true });
    d.showModal();
  });
}
function openLightbox(src){ $('#lbImg').src = src; $('#lb').showModal(); }

/* ---------- photos: shrink before saving so everyone can upload ---------- */
const readDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('image')); r.readAsDataURL(f); });
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('image')); i.src = src; });
async function compressImage(file){
  if (!/^image\//.test(file.type)) throw new Error('image');
  const img = await loadImg(await readDataURL(file));
  let max = 1100, q = 0.74;
  for (let i = 0; i < 8; i++){
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', q);
    if (out.length < 180000) return out;
    if (q > 0.5) q -= 0.1; else max *= 0.8;
  }
  throw new Error('image');
}
function imagePicker(onChange){
  const input = h('input', { type:'file', accept:'image/*', hidden:true });
  const btn = h('button', { type:'button', class:'btn', text:'Add a photo' });
  const thumb = h('div', { class:'thumb', hidden:true });
  let data = null;
  function set(v){
    data = v; thumb.replaceChildren(); thumb.hidden = !v; btn.textContent = v ? 'Change photo' : 'Add a photo';
    if (v) thumb.append(h('img', { src:v, alt:'The photo you added' }), h('button', { type:'button', class:'btn ghost sm', text:'Remove photo', onclick:() => { set(null); onChange && onChange(); } }));
  }
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const f = input.files[0]; input.value = ''; if (!f) return;
    btn.disabled = true; btn.textContent = 'Preparing photo…';
    try { set(await compressImage(f)); onChange && onChange(); }
    catch (e) { toast(errMsg(e)); set(data); }
    finally { btn.disabled = false; }
  });
  return { el:h('div', null, btn, input, thumb), get:() => data, clear:() => set(null) };
}

/* ---------- symbol bar ---------- */
function insertAt(ta, text){
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
  ta.setRangeText(text, s, e, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
}
const symbolBar = ta => h('div', { class:'symbols', role:'toolbar', 'aria-label':'Insert a math symbol' },
  SYMBOLS.map(([c, name]) => h('button', { type:'button', class:'sym', title:name, 'aria-label':name, text:c, onmousedown:e => e.preventDefault(), onclick:() => insertAt(ta, c) })));

/* ---------- data stores: shared board (db) or a local preview ---------- */
function dbStore(db){
  return {
    live:true,
    newId:() => db.collection('questions').doc().id,
    watch:(name, field, dir, limit, cb, err) => db.collection(name).orderBy(field, dir).limit(limit)
      .onSnapshot(s => cb(s.docs.map(d => ({ id:d.id, ...d.data() }))), err),
    put:(name, id, v) => db.doc(name + '/' + id).set(v),
    patch:(name, id, v) => db.doc(name + '/' + id).update(v),
    remove:(name, id) => db.doc(name + '/' + id).delete(),
    read:async (name, id) => { const s = await db.doc(name + '/' + id).get(); return s.exists ? s.data() : null; }
  };
}
function memoryStore(){
  const data = { questions:new Map(), answers:new Map(), notes:new Map(), images:new Map() };
  const subs = [];
  const clone = v => JSON.parse(JSON.stringify(v));
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)){ if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
  const emit = name => subs.filter(s => s.name === name).forEach(s => s.run());
  return {
    live:false,
    newId:() => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    watch(name, field, dir, limit, cb){
      const s = { name, run(){ const arr = [...data[name].entries()].map(([id, v]) => ({ id, ...clone(v) })); arr.sort((a, b) => dir === 'desc' ? b[field] - a[field] : a[field] - b[field]); cb(arr.slice(0, limit)); } };
      subs.push(s); queueMicrotask(() => s.run());
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
    },
    async put(name, id, v){ data[name].set(id, clone(v)); emit(name); },
    async patch(name, id, v){ const cur = data[name].get(id); if (!cur) throw { code:'invalid_argument' }; merge(cur, clone(v)); emit(name); },
    async remove(name, id){ data[name].delete(id); emit(name); },
    async read(name, id){ const v = data[name].get(id); return v ? clone(v) : null; }
  };
}

/* ---------- app state ---------- */
const S = {
  store:null, userNs:null, canPost:true,
  me:{ id:null, name:'', avatarUrl:svgAvatar('?'), canEdit:false, isOwner:false },
  questions:[], answers:[], notes:[],
  qMap:new Map(), byQ:new Map(), notesByA:new Map(), points:new Map(),
  loaded:{ q:false },
  view:{ name:'feed', id:null },
  f:{ q:'', subject:'All', level:'All', tab:'all' },
  drafts:{ ans:{}, fu:{} },
  fuOpen:new Set(), showAnyway:new Set(), sweepId:null,
  img:new Map(), busy:new Set()
};
const A = {};   // answer composer parts

const tier = p => p >= 75 ? 'Mentor' : p >= 25 ? 'Tutor' : p >= 5 ? 'Helper' : '';
const hiddenByReports = it => countTrue(it.reports) >= HIDE_AFTER;

function recompute(){
  S.qMap = new Map(S.questions.map(q => [q.id, q]));
  S.byQ = new Map(); S.notesByA = new Map(); S.points = new Map();
  for (const a of S.answers){ if (!S.byQ.has(a.qid)) S.byQ.set(a.qid, []); S.byQ.get(a.qid).push(a); }
  for (const n of S.notes){ if (!S.notesByA.has(n.answerId)) S.notesByA.set(n.answerId, []); S.notesByA.get(n.answerId).push(n); }
  for (const a of S.answers){
    const q = S.qMap.get(a.qid); if (!q) continue;
    let p = countTrue(a.voters, a.authorId);
    if (q.bestAnswerId === a.id && q.authorId !== a.authorId) p += 5;
    if (p) S.points.set(a.authorId, (S.points.get(a.authorId) || 0) + p);
  }
}

/* ---------- writing to the board ---------- */
async function once(key, fn){
  if (S.busy.has(key)) return; S.busy.add(key);
  try { await fn(); return true; }
  catch (e) { console.error(e); toast(errMsg(e)); return false; }
  finally { S.busy.delete(key); }
}
async function postQuestion({ title, body, subject, level, anon, image }){
  const id = S.store.newId(); let hasImage = false;
  if (image){ await S.store.put('images', id, { data:image }); hasImage = true; }
  try {
    await S.store.put('questions', id, { title, body, subject:subject || 'Other', level:level || 'Other', anon:!!anon, authorId:S.me.id, createdAt:Date.now(), bestAnswerId:null, hasImage, reports:{} });
  } catch (e) { if (hasImage) S.store.remove('images', id).catch(() => {}); throw e; }
}
async function postAnswer(qid, body, image){
  const id = S.store.newId(); let hasImage = false;
  if (image){ await S.store.put('images', id, { data:image }); hasImage = true; }
  try {
    await S.store.put('answers', id, { qid, body, authorId:S.me.id, createdAt:Date.now(), hasImage, voters:{}, reports:{} });
  } catch (e) { if (hasImage) S.store.remove('images', id).catch(() => {}); throw e; }
}
async function postNote(a, body){
  await S.store.put('notes', S.store.newId(), { qid:a.qid, answerId:a.id, body, authorId:S.me.id, createdAt:Date.now() });
}
const toggleVote = a => once('vote' + a.id, () => S.store.patch('answers', a.id, { voters:{ [S.me.id]:!(a.voters && a.voters[S.me.id]) } }));
const markBest = (q, a) => once('best' + q.id, async () => {
  const unmark = q.bestAnswerId === a.id;
  if (!unmark) S.sweepId = a.id;
  await S.store.patch('questions', q.id, { bestAnswerId: unmark ? null : a.id });
  toast(unmark ? 'Best explanation removed' : 'Marked as best explanation');
});
const report = (kind, it) => once('rep' + it.id, async () => {
  await S.store.patch(kind, it.id, { reports:{ [S.me.id]:true } });
  toast('Reported. Thanks for flagging it.');
});
async function deleteAnswerDocs(a){
  for (const n of (S.notesByA.get(a.id) || [])) await S.store.remove('notes', n.id);
  if (a.hasImage) await S.store.remove('images', a.id);
  await S.store.remove('answers', a.id);
}
async function askDelete(kind, it){
  const isQ = kind === 'questions';
  const ok = await confirmDialog(isQ ? 'Delete this question?' : 'Delete this explanation?',
    isQ ? 'Its explanations, follow-ups and photos are deleted too. This can\'t be undone.' : 'Its follow-ups are deleted too. This can\'t be undone.',
    isQ ? 'Delete question' : 'Delete explanation', true);
  if (!ok) return;
  await once('del' + it.id, async () => {
    if (isQ){
      show({ name:'feed' });
      for (const a of (S.byQ.get(it.id) || [])) await deleteAnswerDocs(a);
      if (it.hasImage) await S.store.remove('images', it.id);
      await S.store.remove('questions', it.id);
      toast('Question deleted');
    } else {
      const q = S.qMap.get(it.qid);
      if (q && q.bestAnswerId === it.id) await S.store.patch('questions', q.id, { bestAnswerId:null });
      await deleteAnswerDocs(it);
      toast('Explanation deleted');
    }
  });
}
async function deleteNote(n){
  const ok = await confirmDialog('Delete this follow-up?', "This can't be undone.", 'Delete follow-up', true);
  if (ok) once('del' + n.id, async () => { await S.store.remove('notes', n.id); toast('Follow-up deleted'); });
}

/* ---------- names, photos ---------- */
async function resolveNames(){
  const nodes = [...document.querySelectorAll('[data-uid]')].filter(n => n.dataset.uid);
  if (!nodes.length) return;
  const ids = [...new Set(nodes.map(n => n.dataset.uid))];
  let ps = {};
  if (S.userNs){ try { ps = await S.userNs.profiles(ids); } catch (e) {} }
  for (const n of nodes){
    const id = n.dataset.uid, p = ps[id], isMe = id === S.me.id;
    const name = (p && p.name) || (isMe ? (S.me.name || 'You') : 'A student');
    if (n.tagName === 'IMG') n.src = (p && p.avatarUrl) || (isMe && S.me.avatarUrl) || svgAvatar(name);
    else n.textContent = name + (isMe && !n.hasAttribute('data-plain') && name !== 'You' ? ' (you)' : '');
  }
}
function loadImage(id){
  if (!S.img.has(id)) S.img.set(id, S.store.read('images', id).then(d => (d && d.data) || null).catch(() => null));
  return S.img.get(id);
}
function imageBlock(id, alt){
  const img = h('img', { class:'pic', alt });
  const btn = h('button', { type:'button', class:'imgbtn', 'aria-label':'Enlarge photo', hidden:true, onclick:() => openLightbox(img.src) }, img);
  loadImage(id).then(src => { if (src){ img.src = src; btn.hidden = false; } });
  return btn;
}

/* ---------- small UI pieces ---------- */
const chip = t => h('span', { class:'chip', text:t });
function author(it, anonymousOk){
  if (anonymousOk && it.anon) return h('span', { class:'who', text:'Anonymous' });
  return h('span', { class:'row', style:'gap:6px' }, h('img', { class:'avatar', alt:'', dataset:{ uid:it.authorId } }), h('span', { class:'who', dataset:{ uid:it.authorId } }));
}
function hiddenNote(id){
  return h('div', { class:'hidden-note' }, h('p', { text:'Hidden after several reports.' }),
    h('button', { class:'btn sm', type:'button', text:'Show anyway', onclick:() => { S.showAnyway.add(id); render(); } }));
}
function itemActions(kind, it){
  const mine = it.authorId === S.me.id, reported = !!(it.reports && it.reports[S.me.id]), n = countTrue(it.reports);
  return [
    (!mine && S.canPost) ? h('button', { class:'btn ghost sm', type:'button', disabled:reported, text:reported ? 'Reported' : 'Report', onclick:() => report(kind, it) }) : null,
    (mine || S.me.canEdit) ? h('button', { class:'btn ghost sm danger-text', type:'button', text:'Delete', onclick:() => askDelete(kind, it) }) : null,
    (S.me.canEdit && n > 0) ? h('span', { class:'flag', text:'Reported by ' + n }) : null
  ];
}
/* ---------- rendering: home ---------- */
function feedBase(){
  const q = S.f.q.trim().toLowerCase();
  return S.questions.filter(x => {
    if (!S.me.canEdit && hiddenByReports(x)) return false;
    if (S.f.subject !== 'All' && x.subject !== S.f.subject) return false;
    if (S.f.level !== 'All' && x.level !== S.f.level) return false;
    if (q && !(x.title + ' ' + x.body + ' ' + x.subject).toLowerCase().includes(q)) return false;
    return true;
  });
}
const noAnswers = x => !x.bestAnswerId && !(S.byQ.get(x.id) || []).length;

function renderFeed(){
  const list = $('#list'); list.replaceChildren();
  const base = feedBase();
  const counts = { all:base.length, open:base.filter(noAnswers).length, solved:base.filter(x => !!x.bestAnswerId).length };
  const labels = { all:'All', open:'Needs an answer', solved:'Solved' };
  $('#tabs').replaceChildren(...Object.keys(labels).map(k => h('button', { type:'button', class:'tab', 'aria-pressed':String(S.f.tab === k), text:labels[k] + ' (' + counts[k] + ')', onclick:() => { S.f.tab = k; renderFeed(); } })));
  if (!S.loaded.q){ list.append(h('p', { class:'muted', text:'Loading questions…' })); return; }
  const items = base.filter(x => S.f.tab === 'all' || (S.f.tab === 'open' ? noAnswers(x) : !!x.bestAnswerId));
  if (!items.length){
    const filtered = S.questions.length > 0;
    list.append(h('div', { class:'empty' },
      h('p', { text: filtered ? 'No questions match these filters.' : 'No questions yet. Ask the first one above.' }),
      filtered ? h('button', { class:'btn', type:'button', text:'Clear filters', onclick:clearFilters }) : null));
    return;
  }
  items.forEach(q => list.append(qCard(q)));
}
function clearFilters(){
  S.f = { q:'', subject:'All', level:'All', tab:'all' };
  $('#search').value = ''; $('#fSubject').value = 'All'; $('#fLevel').value = 'All'; renderFeed(); resolveNames();
}
function qCard(q){
  const n = (S.byQ.get(q.id) || []).length;
  const st = q.bestAnswerId ? 'solved' : n ? 'answered' : 'open';
  const status = st === 'solved' ? h('mark', { class:'hl', text:'Solved' }) : h('span', { text: n ? n + (n === 1 ? ' explanation' : ' explanations') : 'Needs an answer' });
  return h('article', { class:'qcard st-' + st, onclick:() => show({ name:'q', id:q.id }) },
    h('div', { class:'chips' }, chip(q.subject), chip(q.level), q.hasImage ? chip('Photo') : null),
    h('h3', null, h('button', { class:'qtitle', type:'button', text:q.title })),
    h('p', { class:'qexcerpt', text:q.body.replace(/\s+/g, ' ').slice(0, 180) }),
    h('div', { class:'meta' }, author(q, true), h('span', { text:timeAgo(q.createdAt) }), status));
}
function renderHelpers(){
  const box = $('#helpers');
  const top = [...S.points].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length){ box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(h('h2', { class:'sec', text:'Top helpers' }),
    h('ul', { class:'helpers' }, top.map(([id, p]) => h('li', null,
      h('img', { class:'avatar', alt:'', dataset:{ uid:id } }), h('span', { class:'who', dataset:{ uid:id, plain:'' } }),
      tier(p) ? h('span', { class:'badge', text:tier(p) }) : null, h('span', { class:'hpts', text:p + ' points' })))));
}

/* ---------- rendering: one question ---------- */
function noteNode(n){
  return h('div', { class:'note' },
    h('div', { class:'byline', style:'margin:0 0 2px' }, author(n), h('span', { text:timeAgo(n.createdAt) }),
      (n.authorId === S.me.id || S.me.canEdit) ? h('button', { class:'btn ghost sm danger-text', type:'button', text:'Delete', onclick:() => deleteNote(n) }) : null),
    h('div', { class:'rich', html:rich(n.body) }));
}
function fuComposer(a){
  const ta = h('textarea', { class:'field', rows:2, maxlength:LIMITS.note, placeholder:'Which part is still unclear?', 'aria-label':'Follow-up', dataset:{ key:'fu-' + a.id }, value:S.drafts.fu[a.id] || '' });
  ta.style.minHeight = '64px';
  const btn = h('button', { class:'btn primary sm', type:'button', text:'Post follow-up', disabled:ta.value.trim().length < 2 });
  ta.addEventListener('input', () => { S.drafts.fu[a.id] = ta.value; btn.disabled = ta.value.trim().length < 2; });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const ok = await once('note' + a.id, async () => { await postNote(a, ta.value.trim()); S.drafts.fu[a.id] = ''; toast('Follow-up posted'); });
    if (!ok) btn.disabled = ta.value.trim().length < 2;
  });
  return h('div', { class:'row', style:'align-items:flex-end;flex-wrap:nowrap' }, h('div', { style:'flex:1;min-width:0' }, ta), btn);
}
function aCard(a, q){
  const isBest = q.bestAnswerId === a.id, own = a.authorId === S.me.id;
  const votes = countTrue(a.voters, a.authorId), iVoted = !!(a.voters && a.voters[S.me.id]);
  const notes = S.notesByA.get(a.id) || [], open = S.fuOpen.has(a.id);
  const hid = hiddenByReports(a) && !S.showAnyway.has(a.id);
  const sweep = isBest && S.sweepId === a.id; if (sweep) S.sweepId = null;
  const pts = S.points.get(a.authorId) || 0;
  return h('article', { class:'acard' + (isBest ? ' best' : '') + (sweep ? ' sweep' : '') },
    isBest ? h('p', { class:'bestflag' }, h('mark', { class:'hl', text:'Best explanation' })) : null,
    h('div', { class:'byline', style:'margin-bottom:6px' }, author(a), tier(pts) ? h('span', { class:'badge', title:pts + ' points from helpful votes and best explanations', text:tier(pts) }) : null, h('span', { text:timeAgo(a.createdAt) })),
    hid ? hiddenNote(a.id) : h('div', { class:'rich', html:rich(a.body) }),
    (!hid && a.hasImage) ? imageBlock(a.id, 'Photo attached to this explanation') : null,
    h('div', { class:'acts' },
      h('button', { class:'btn sm toggle', type:'button', 'aria-pressed':String(iVoted), disabled:own || !S.canPost, title: own ? "You can't vote on your own explanation" : 'This explanation helped', onclick:() => toggleVote(a) }, 'Helpful', h('span', { class:'count', text:String(votes) })),
      h('button', { class:'btn sm', type:'button', 'aria-expanded':String(open), text:'Follow-up' + (notes.length ? ' (' + notes.length + ')' : ''), onclick:() => { open ? S.fuOpen.delete(a.id) : S.fuOpen.add(a.id); render(); } }),
      (q.authorId === S.me.id && S.canPost) ? h('button', { class:'btn sm', type:'button', text: isBest ? 'Remove best mark' : 'Mark as best', onclick:() => markBest(q, a) }) : null,
      itemActions('answers', a)),
    open ? h('div', { class:'fu' }, notes.map(noteNode), S.canPost ? fuComposer(a) : null) : null);
}
function renderDetail(){
  const q = S.qMap.get(S.view.id);
  const head = $('#qHead'), list = $('#aList'), comp = $('#ansComposer');
  if (!q){
    head.replaceChildren(h('p', { class:'muted', text: S.loaded.q ? 'This question is gone.' : 'Loading…' }));
    list.replaceChildren(); comp.hidden = true;
    if (S.loaded.q){ show({ name:'feed' }); toast('That question was deleted.'); }
    return;
  }
  const hid = hiddenByReports(q) && !S.showAnyway.has(q.id);
  head.replaceChildren(frag(
    h('div', { class:'chips' }, chip(q.subject), chip(q.level), q.bestAnswerId ? h('mark', { class:'hl', text:'Solved' }) : null),
    h('h1', { tabindex:'-1', text:q.title }),
    h('div', { class:'byline' }, author(q, true), h('span', { text:timeAgo(q.createdAt) })),
    hid ? hiddenNote(q.id) : h('div', { class:'rich', html:rich(q.body) }),
    (!hid && q.hasImage) ? imageBlock(q.id, 'Photo attached to the question') : null,
    h('div', { class:'acts' }, itemActions('questions', q))));

  const answers = (S.byQ.get(q.id) || []).slice().sort((a, b) =>
    ((b.id === q.bestAnswerId) - (a.id === q.bestAnswerId)) || (countTrue(b.voters, b.authorId) - countTrue(a.voters, a.authorId)) || (a.createdAt - b.createdAt));
  list.replaceChildren(frag(
    h('h2', { class:'sec', text: answers.length ? answers.length + (answers.length === 1 ? ' explanation' : ' explanations') : 'No explanations yet' }),
    answers.length ? answers.map(a => aCard(a, q)) : h('div', { class:'empty' }, h('p', { text: S.canPost ? 'Nobody has explained this yet. Write out the steps below.' : 'Nobody has explained this yet.' }))));
  comp.hidden = !S.canPost;
}

/* ---------- rendering: shell ---------- */
function renderMe(){
  const box = $('#me'); box.replaceChildren();
  if (!S.me.id) return;
  box.append(h('img', { class:'avatar', alt:'', dataset:{ uid:S.me.id } }), h('span', { dataset:{ uid:S.me.id, plain:'' } }));
}
function withFocus(fn){
  const a = document.activeElement, key = a && a.dataset && a.dataset.key;
  const s = a && a.selectionStart, e = a && a.selectionEnd;
  fn();
  if (key){ const n = [...document.querySelectorAll('[data-key]')].find(x => x.dataset.key === key); if (n){ n.focus(); try { n.setSelectionRange(s, e); } catch (x) {} } }
}
function render(){
  withFocus(() => {
    renderMe();
    if (S.view.name === 'feed'){ renderHelpers(); renderFeed(); } else renderDetail();
  });
  resolveNames();
}
let raf = 0;
const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

function show(view){
  S.view = view;
  $('#feedView').hidden = view.name !== 'feed'; $('#qView').hidden = view.name !== 'q';
  window.scrollTo(0, 0);
  if (view.name === 'q'){
    A.ta.value = S.drafts.ans[view.id] || ''; A.picker.clear(); A.btn.disabled = A.ta.value.trim().length < 5;
  }
  render();
  if (view.name === 'q'){ const t = $('#qHead h1'); if (t) t.focus({ preventScroll:true }); }
}

/* ---------- composers ---------- */
const selectEl = (first, opts, label) => h('select', { class:'field', 'aria-label':label }, h('option', { value:'', text:first }), opts.map(o => h('option', { value:o, text:o })));

function buildAsk(){
  const title = h('input', { class:'field big', type:'text', maxlength:LIMITS.title, placeholder:'Type your question here', 'aria-label':'Question title', autocomplete:'off' });
  const body = h('textarea', { class:'field', rows:5, maxlength:LIMITS.body, placeholder:'Add details: what you tried and where you got stuck.', 'aria-label':'Question details' });
  const subject = selectEl('Subject', SUBJECTS, 'Subject'), level = selectEl('Level', LEVELS, 'Level');
  const anon = h('input', { type:'checkbox' });
  const picker = imagePicker();
  const post = h('button', { class:'btn primary', type:'button', text:'Post question', disabled:true });
  const more = h('div', { class:'more', hidden:true },
    body, symbolBar(body),
    h('p', { class:'tip', text:'Tip: type x^2 for x², H_2O for H₂O, sqrt(16) for √(16). Start each step on a new line.' }),
    h('div', { class:'pair' }, subject, level),
    picker.el,
    h('label', { class:'check' }, anon, 'Hide my name from other students'),
    h('div', { class:'row end' }, post));
  const sync = () => { post.disabled = title.value.trim().length < 5; };
  title.addEventListener('input', sync);
  title.addEventListener('focus', () => { more.hidden = false; });
  post.addEventListener('click', async () => {
    post.disabled = true; post.textContent = 'Posting…';
    const ok = await once('ask', () => postQuestion({ title:title.value.trim(), body:body.value.trim() || title.value.trim(), subject:subject.value, level:level.value, anon:anon.checked, image:picker.get() }));
    post.textContent = 'Post question';
    if (ok){ title.value = ''; body.value = ''; subject.value = ''; level.value = ''; anon.checked = false; picker.clear(); more.hidden = true; toast('Question posted'); }
    sync();
  });
  return h('div', null, title, more);
}
function buildAnswerComposer(){
  const ta = h('textarea', { class:'field', rows:6, maxlength:LIMITS.answer, placeholder:'Explain it step by step. Start each step on a new line.', 'aria-label':'Your explanation' });
  const btn = h('button', { class:'btn primary', type:'button', text:'Post explanation', disabled:true });
  const picker = imagePicker();
  ta.addEventListener('input', () => { if (S.view.id) S.drafts.ans[S.view.id] = ta.value; btn.disabled = ta.value.trim().length < 5; });
  btn.addEventListener('click', async () => {
    const qid = S.view.id; btn.disabled = true; btn.textContent = 'Posting…';
    const ok = await once('ans', () => postAnswer(qid, ta.value.trim(), picker.get()));
    btn.textContent = 'Post explanation';
    if (ok){ ta.value = ''; S.drafts.ans[qid] = ''; picker.clear(); toast('Explanation posted'); }
    btn.disabled = ta.value.trim().length < 5;
  });
  Object.assign(A, { ta, btn, picker });
  return [h('h2', { text:'Your explanation' }), ta, symbolBar(ta),
    h('p', { class:'tip', text:'Tip: type x^2 for x², sqrt(16) for √(16). A photo of handwritten work is welcome.' }),
    picker.el, h('div', { class:'row end' }, btn)];
}

/* ---------- start ---------- */
function buildShell(){
  $('#fSubject').append(frag(h('option', { value:'All', text:'All subjects' }), SUBJECTS.map(s => h('option', { value:s, text:s }))));
  $('#fLevel').append(frag(h('option', { value:'All', text:'All levels' }), LEVELS.map(s => h('option', { value:s, text:s }))));
  $('#search').addEventListener('input', e => { S.f.q = e.target.value; renderFeed(); resolveNames(); });
  $('#fSubject').addEventListener('change', e => { S.f.subject = e.target.value; renderFeed(); resolveNames(); });
  $('#fLevel').addEventListener('change', e => { S.f.level = e.target.value; renderFeed(); resolveNames(); });
  $('#back').addEventListener('click', () => show({ name:'feed' }));
  $('#lb').addEventListener('click', () => $('#lb').close());
  $('#ansComposer').append(...buildAnswerComposer());
}
function banner(msg){ const b = $('#banner'); b.textContent = msg; b.hidden = !msg; }

async function boot(){
  buildShell();
  render();
  const use = async n => { try { return window.claude && window.claude.use ? await window.claude.use(n) : null; } catch (e) { return null; } };
  const [db, user] = await Promise.all([use('db'), use('user')]);
  S.userNs = user;
  if (user){
    S.me = await user.me();
    const dw = await user.can('data.write');
    S.canPost = dw !== false && !!S.me.id;
  }
  if (db){
    S.store = dbStore(db);
    if (!S.me.id) banner('You can read questions here, but posting needs a signed-in account.');
    else if (!S.canPost) banner('You have view-only access, so you can read but not post.');
  } else {
    S.store = memoryStore();
    S.me = { id:'local', name:'You', avatarUrl:svgAvatar('Y'), canEdit:true, isOwner:true };
    S.canPost = true;
    banner('Preview mode: this page is not connected to the shared board. What you post stays on this device until you reload.');
  }
  if (S.canPost) $('#askSlot').append(buildAsk());
  else $('#askSlot').append(h('p', { class:'muted', text:'Posting is turned off for this view.' }));

  const fail = () => banner('The shared board stopped responding. Reload the page to reconnect.');
  const onData = key => list => { S[key] = list; if (key === 'questions') S.loaded.q = true; recompute(); scheduleRender(); };
  S.store.watch('questions', 'createdAt', 'desc', 500, onData('questions'), fail);
  S.store.watch('answers', 'createdAt', 'asc', 1000, onData('answers'), fail);
  S.store.watch('notes', 'createdAt', 'asc', 1000, onData('notes'), fail);
  render();
}
boot().catch(e => { console.error(e); banner('Something went wrong while starting. Reload the page to try again.'); });
})();
