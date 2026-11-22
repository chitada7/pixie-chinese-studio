/* Pixie Chinese Studio — HSK 3 단어·문법 학습 앱 */
'use strict';
const EXAM = '2027-01-09';
const PER_DAY = 20;
const KEY = 'pcs-state-v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const fmtMD = s => { const d = parseD(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

/* ---------- state ---------- */
const DEF = () => ({ v: 1, start: today(), p: {}, hard: {}, r: {}, g: {}, gw: {}, ww: {}, qlog: [], set: { rate: 0.85, slow: 0.5, py: true, tone: true, theme: 'auto', mean: 'show' }, lastBackup: null, created: Date.now() });
let S;
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || DEF(); } catch (e) { S = DEF(); }
  const d = DEF();
  for (const k in d) if (S[k] === undefined) S[k] = d[k];
  for (const k in d.set) if (S.set[k] === undefined) S.set[k] = d.set[k];
}
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 공간이 부족해요. 기록을 내보내 주세요.'); }
  }, 120);
}
function saveNow() { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); else rerenderIfDayChanged(); });

/* ---------- data ---------- */
let D, W, BYN, NEW, OLD, G, GBYID, MAXDAY;
const first = s => String(s).split(/[/／]/)[0].trim();
const toneless = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'v').toLowerCase().replace(/[^a-z]/g, '');
function prep() {
  W = D.words; G = D.grammar;
  BYN = new Map(W.map(w => [w.n, w]));
  NEW = W.filter(w => w.s === 'new');
  OLD = W.filter(w => w.s === 'old');
  MAXDAY = Math.max(...NEW.map(w => w.d));
  GBYID = new Map(G.map(g => [g.id, g]));
  for (const w of W) {
    w.hz = first(w.w);
    w.pt = toneless(w.p);
    w.pts = (w.p || '').split(/[/／]/).map(toneless);
    w.isZh = /^[㐀-鿿]+$/.test(w.hz);
  }
}

/* ---------- progress helpers ---------- */
const prog = n => S.p[n] || (S.p[n] = {});
const isDone = w => { const p = S.p[w.n]; if (p && p.done !== undefined) return !!p.done; return w.s === 'old'; };
const isHard = w => !!S.hard[w.n];
function curDay() { return Math.min(Math.max(diffDays(S.start, today()) + 1, 1), MAXDAY); }
const dayWords = d => NEW.filter(w => w.d === d);
const newDone = () => NEW.filter(isDone).length;
const hardList = () => W.filter(isHard);
function setDone(w, v) {
  const p = prog(w.n); p.done = v ? 1 : 0;
  if (v) { p.t = today(); if (!S.r[w.n]) S.r[w.n] = { st: 0, due: addDays(today(), 1) }; }
  save();
}
function reviewDue() {
  const t = today();
  return W.filter(w => S.r[w.n] && S.r[w.n].st < 3 && S.r[w.n].due <= t);
}
function learnedPool() {
  const cd = curDay();
  return W.filter(w => w.s === 'old' || w.d <= cd || isDone(w));
}
let lastDay = today();
function rerenderIfDayChanged() { if (today() !== lastDay) { lastDay = today(); route(); } }

/* ---------- tone helpers ---------- */
const TONEMAP = {};
'āáǎà ēéěè īíǐì ōóǒò ūúǔù ǖǘǚǜ'.split(' ').forEach(g => [...g].forEach((c, i) => TONEMAP[c] = i + 1));
const toneOf = s => { for (const c of s) if (TONEMAP[c]) return TONEMAP[c]; return 5; };
function pyHTML(w) {
  if (!S.set.py) return '';
  if (!S.set.tone || !w.sy) return esc(w.p);
  return w.sy.map(s => `<span class="tn${toneOf(s)}">${esc(s)}</span>`).join('');
}
function hzHTML(w) {
  if (!S.set.tone || !w.sy || w.sy.length !== [...w.hz].length) return esc(w.w);
  const rest = w.w.slice(w.hz.length);
  return [...w.hz].map((c, i) => `<span class="tn${toneOf(w.sy[i])}">${c}</span>`).join('') + esc(rest);
}

/* ---------- speech ---------- */
const TTS = {
  voice: null, ok: 'speechSynthesis' in window, cur: null,
  init() {
    if (!this.ok) return;
    const pickV = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /zh[-_]CN/i.test(v.lang) && /Tingting|婷婷|Lili|Li-mu|Yu-shu/i.test(v.name)) || vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) || null;
    };
    pickV();
    speechSynthesis.onvoiceschanged = pickV;
  },
  speak(text, slow, btn) {
    if (!this.ok) { toast('이 브라우저는 음성 재생을 지원하지 않아요'); return Promise.resolve(); }
    text = String(text).replace(/[A-Za-z]/g, '').replace(/……/g, '，');
    try { speechSynthesis.cancel(); } catch (e) { }
    $$('.playing').forEach(b => b.classList.remove('playing'));
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (this.voice) u.voice = this.voice;
      u.rate = slow ? S.set.slow : S.set.rate;
      u.pitch = 1;
      const end = () => { if (btn) btn.classList.remove('playing'); res(); };
      u.onend = end; u.onerror = end;
      if (btn) btn.classList.add('playing');
      this.cur = u;
      // iOS: speaking right after cancel can be swallowed — tiny delay
      setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) { end(); } }, 60);
      setTimeout(end, 15000);
    });
  },
  stop() { try { speechSynthesis.cancel(); } catch (e) { } $$('.playing').forEach(b => b.classList.remove('playing')); }
};

/* ---------- speaking practice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC = {
  rec: null, mr: null, chunks: [], btn: null, url: null,
  busy() { return !!(this.rec || this.mr); },
  stop() { try { this.rec && this.rec.stop(); } catch (e) { } try { this.mr && this.mr.state !== 'inactive' && this.mr.stop(); } catch (e) { } },
  start(target, btn, box, onOk) {
    if (this.busy()) { this.stop(); return; }
    TTS.stop();
    this.btn = btn;
    const label = btn.textContent;
    const done = () => { btn.classList.remove('rec'); btn.textContent = label; this.rec = null; this.mr = null; };
    if (SR) {
      const r = new SR();
      r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 3; r.continuous = false;
      let got = false;
      r.onresult = ev => {
        got = true;
        const alts = [...ev.results[0]].map(a => a.transcript);
        const best = alts.map(a => ({ a, sc: sim(a, target) })).sort((x, y) => y.sc - x.sc)[0];
        showSpeak(box, target, best.a, best.sc);
        if (best.sc >= 0.8) onOk();
      };
      r.onerror = ev => {
        got = true;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') box.innerHTML = `<div class="fb no small">마이크나 음성 인식 권한이 꺼져 있어요. 아이폰 설정 → Safari → 마이크를 '허용'으로 바꾸고, 설정 → 일반 → 키보드 → '받아쓰기'를 켜 주세요.</div>`;
        else if (ev.error === 'no-speech') box.innerHTML = `<div class="fb no small">소리가 안 들렸어요. 버튼을 누르고 바로 말해 보세요.</div>`;
        else box.innerHTML = `<div class="fb no small">음성 인식이 잘 안 됐어요 (${esc(ev.error)}). 다시 해 보세요.</div>`;
      };
      r.onend = () => { if (!got) box.innerHTML = `<div class="fb no small">잘 못 알아들었어요. 조금 더 크게, 또박또박 말해 보세요.</div>`; done(); };
      try { r.start(); this.rec = r; btn.classList.add('rec'); btn.textContent = '⏹ 듣는 중… (눌러서 끝내기)'; box.innerHTML = `<div class="small muted">지금 중국어로 말해 보세요</div>`; }
      catch (e) { done(); this.recordOnly(target, btn, box, label); }
      return;
    }
    this.recordOnly(target, btn, box, label);
  },
  async recordOnly(target, btn, box, label) {
    if (!navigator.mediaDevices || !window.MediaRecorder) { box.innerHTML = `<div class="fb no small">이 브라우저에서는 녹음을 쓸 수 없어요. 소리 내어 따라 말한 뒤 체크해 주세요.</div>`; return; }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(st); this.mr = mr; this.chunks = [];
      mr.ondataavailable = e => this.chunks.push(e.data);
      mr.onstop = () => {
        st.getTracks().forEach(t => t.stop());
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(new Blob(this.chunks, { type: mr.mimeType || 'audio/mp4' }));
        box.innerHTML = `<div class="fb ok small"><b>녹음했어요.</b> 내 발음과 원어민 발음을 비교해 보세요.<div class="audio-row" style="justify-content:flex-start"><button class="abtn" data-act="myvoice">▶️ 내 목소리</button><button class="abtn slow" data-act="qsay" data-t="${esc(target)}">🔊 원어민</button></div></div>`;
        btn.classList.remove('rec'); btn.textContent = label; this.mr = null;
      };
      mr.start(); btn.classList.add('rec'); btn.textContent = '⏹ 녹음 중… (눌러서 끝내기)';
      box.innerHTML = `<div class="small muted">지금 따라 말해 보세요</div>`;
    } catch (e) { box.innerHTML = `<div class="fb no small">마이크를 쓸 수 없어요. 아이폰 설정 → Safari → 마이크를 '허용'으로 바꿔 주세요.</div>`; }
  }
};
const normZh = s => String(s).replace(/[^\u3400-\u9fff0-9]/g, '');
function sim(a, b) {
  a = normZh(a); b = normZh(b); if (!a || !b) return 0;
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n] / Math.max(m, n);
}
function showSpeak(box, target, heard, sc) {
  const pct = Math.round(sc * 100);
  const tset = normZh(heard);
  const marked = [...normZh(target)].map(c => tset.includes(c) ? `<span style="color:var(--mint)">${c}</span>` : `<span style="color:var(--red);text-decoration:underline">${c}</span>`).join('');
  box.innerHTML = `<div class="fb ${sc >= 0.8 ? 'ok' : 'no'}"><b>${sc >= 0.8 ? '잘했어요! 🎉' : sc >= 0.5 ? '거의 다 왔어요! 한 번 더 💪' : '다시 한 번 해 봐요 🙂'}</b> <span class="small muted">일치 ${pct}%</span>
    <div class="small mt8">내가 말한 것: <span class="zh" style="font-size:17px">${esc(heard) || '—'}</span></div>
    <div class="small">목표 문장: <span class="zh" style="font-size:17px">${marked}</span></div>
    <div class="small muted mt8">빨간 글자는 인식되지 않은 부분이에요. 아이폰 음성 인식 기준이라 성조까지 정확히 채점하지는 않아요.</div></div>`;
}

/* ---------- UI helpers ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }
function setTop(title, opts = {}) {
  const back = opts.back ? `<button class="back" data-act="back" aria-label="뒤로">‹</button>` : '';
  const right = opts.right || '';
  $('#top').innerHTML = `${back}<h1>${title}</h1>${right}`;
}
function setTab(t) { $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); }
function view(html) { const v = $('#view'); v.innerHTML = `<div class="fade-in">${html}</div>`; }
function applyTheme() {
  const t = S.set.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#17151B' : '#FFF8F6';
}
const spkBtn = (n, kind = 'w') => `<button class="spk" data-act="say" data-n="${n}" data-k="${kind}" aria-label="듣기">🔊</button>`;
function sayWord(w, kind, slow, btn) {
  if (kind === 'e') return TTS.speak(w.ez, slow, btn);
  return TTS.speak(w.isZh ? w.hz : (w.ez || w.hz), slow, btn);
}
function sheet(html) {
  const s = $('#sheet'); s.innerHTML = `<div class="in fade-in">${html}</div>`; s.hidden = false;
  s.onclick = e => { if (e.target === s) closeSheet(); };
}
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }

/* ---------- router ---------- */
const nav = (h, replace) => { if (replace) { history.replaceState(null, '', '#' + h); route(); } else if (location.hash === '#' + h) route(); else location.hash = h; };
window.addEventListener('hashchange', route);
let scrollMem = {};
function route() {
  TTS.stop(); MIC.stop();
  closeSheet();
  const h = (location.hash || '#home').slice(1);
  const [name, a, b] = h.split('/');
  window.scrollTo(0, 0);
  const R = {
    home: () => vHome(), today: () => vToday(a ? +a : null), card: () => vCard(+a, b), practice: () => vPractice(),
    quiz: () => vQuiz(a, b), dict: () => vDict(), grammar: () => vGrammarList(), g: () => vGrammar(+a), gq: () => vGQuiz(a),
    hard: () => vHard(), settings: () => vSettings(), report: () => vReport(), review: () => vReview(), plan: () => vPlan()
  };
  (R[name] || R.home)();
  if (name === 'dict' && scrollMem.dict) setTimeout(() => window.scrollTo(0, scrollMem.dict), 0);
}

/* ---------- HOME ---------- */
function ring(pct, size = 84, stroke = 9, color = '#fff', bg = 'rgba(255,255,255,.3)') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${bg}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>`;
}
function vHome() {
  setTab('home');
  setTop('Pixie Chinese Studio', { right: `<button class="icon-btn" data-go="settings" aria-label="설정">⚙️</button>` });
  const dd = diffDays(today(), EXAM);
  const cd = curDay();
  const tw = dayWords(cd);
  const tdone = tw.filter(isDone).length;
  const nd = newDone();
  const hard = hardList().length;
  const overdue = NEW.filter(w => w.d < cd && !isDone(w)).length;
  const due = reviewDue().length;
  const finish = addDays(S.start, MAXDAY - 1);
  const needBackup = Object.keys(S.p).length > 5 && (!S.lastBackup || diffDays(S.lastBackup, today()) >= 7);
  const ddTxt = dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : `D+${-dd}`;
  view(`
  <div class="hero">
    <div class="row">
      <div>
        <div class="dlabel">HSK 3급 · 2027년 1월 9일</div>
        <div class="dday">${ddTxt}</div>
        <div class="sub">학습 ${cd}일차 / ${MAXDAY}일 · ${fmtMD(finish)} 새 단어 완주 예정</div>
      </div>
      <div class="ring">${ring(tw.length ? tdone / tw.length : 0)}<div class="rt"><div>${tdone}/${tw.length}<small>오늘 진도</small></div></div></div>
    </div>
  </div>
  <div class="stats">
    <div class="stat mint"><b>${nd}</b><span>새 단어 완료<br><small class="muted">/ ${NEW.length}</small></span></div>
    <div class="stat pri"><b>${OLD.length + nd}</b><span>전체 학습 단어<br><small class="muted">/ ${W.length}</small></span></div>
    <div class="stat gold"><b>${hard}</b><span>어려운 단어<br><small class="muted">⭐ 표시</small></span></div>
  </div>
  ${needBackup ? `<button class="banner gold" data-go="settings" style="width:100%;text-align:left"><span>💾</span><span>일주일 넘게 백업을 안 했어요. <b>기록 내보내기</b>로 저장해 두세요.</span><span class="go">백업 ›</span></button>` : ''}
  ${overdue ? `<button class="banner blue" data-go="today/${NEW.find(w => w.d < cd && !isDone(w)).d}" style="width:100%;text-align:left"><span>📌</span><span>지난 날 못 끝낸 단어가 <b>${overdue}개</b> 있어요.</span><span class="go">이어서 ›</span></button>` : ''}
  ${due ? `<button class="banner mint" data-go="review" style="width:100%;text-align:left"><span>🔁</span><span>오늘 복습할 단어 <b>${due}개</b> (1·3·7일 복습)</span><span class="go">복습 ›</span></button>` : ''}
  <button class="btn" data-act="start">${tdone === tw.length && tw.length ? '오늘 학습 다시 보기' : tdone ? '오늘 학습 이어하기' : '오늘 학습 시작'} ›</button>
  <div class="sec-h"><h2>오늘 배울 단어 ${tw.length}개</h2><button class="more" data-go="plan">전체 일정 ›</button></div>
  <div class="wl">${tw.map(wordRow).join('')}</div>
  <div class="row2"><button class="btn sec sm" data-go="practice">✏️ 오늘 단어 연습</button><button class="btn sec sm" data-go="grammar">🧩 문법 공부</button></div>
  `);
}
function wordRow(w) {
  const done = isDone(w);
  return `<div class="wi" data-go="card/${w.n}">
    <span class="num">${w.n}</span>
    <div class="body"><div><span class="hz">${esc(w.w)}</span>${S.set.py ? `<span class="py">${esc(w.p)}</span>` : ''}${isHard(w) ? ' <span class="st">⭐</span>' : ''}</div>
    <div class="ko">${esc(w.k)}</div></div>
    <span class="done-dot ${done ? 'on' : ''}">✓</span>
    ${spkBtn(w.n)}
  </div>`;
}

/* ---------- TODAY ---------- */
function vToday(d) {
  setTab('today');
  const cd = curDay();
  d = d || cd;
  d = Math.min(Math.max(d, 1), MAXDAY);
  const ws = dayWords(d);
  const done = ws.filter(isDone).length;
  const date = addDays(S.start, d - 1);
  setTop('오늘의 단어');
  const overdue = NEW.filter(w => w.d < cd && !isDone(w));
  view(`
  <div class="daybar">
    <button data-go="today/${d - 1}" ${d <= 1 ? 'disabled style="opacity:.3"' : ''} aria-label="이전 날">‹</button>
    <div class="dt">${d === cd ? '오늘 · ' : ''}${d}일차 <small>${fmtMD(date)} · ${done}/${ws.length} 완료</small></div>
    <button data-go="today/${d + 1}" ${d >= MAXDAY ? 'disabled style="opacity:.3"' : ''} aria-label="다음 날">›</button>
  </div>
  ${d > cd ? `<div class="banner blue"><span>⏩</span><span>아직 오지 않은 날이에요. 미리 공부해도 괜찮아요.</span></div>` : ''}
  ${d !== cd ? `<button class="btn sec sm" data-go="today/${cd}" style="margin-bottom:12px">오늘(${cd}일차)로 가기</button>` : ''}
  <div class="wl">${ws.map(wordRow).join('')}</div>
  <button class="btn" data-go="card/${(ws.find(w => !isDone(w)) || ws[0]).n}/d">카드로 공부하기 ›</button>
  ${overdue.length && d === cd ? `<div class="sec-h"><h2>밀린 단어 ${overdue.length}개</h2></div><div class="wl">${overdue.slice(0, 40).map(wordRow).join('')}</div>${overdue.length > 40 ? `<p class="note">지난 일차로 이동하면 나머지도 볼 수 있어요.</p>` : ''}` : ''}
  <p class="note">새 단어는 1급 → 2급 → 3급 순서로 하루 ${PER_DAY}개씩 나와요. 예문은 기존 단어장 563개와 그날까지 배운 단어로만 만들었어요.</p>
  `);
}

/* ---------- CARD ---------- */
let cardCtx = null; // {list:[n], idx}
function cardList(n, mode) {
  const w = BYN.get(n);
  if (mode === 'd' && w.s === 'new') return dayWords(w.d).map(x => x.n);
  if (mode === 'h') return hardList().map(x => x.n);
  if (mode === 'r') return reviewDue().map(x => x.n);
  if (cardCtx && cardCtx.list.includes(n)) return cardCtx.list;
  if (w.s === 'new') return dayWords(w.d).map(x => x.n);
  return [n];
}
function vCard(n, mode) {
  const w = BYN.get(n);
  if (!w) return nav('home', true);
  setTab(w.s === 'new' ? 'today' : 'dict');
  const list = cardList(n, mode);
  cardCtx = { list, mode };
  const idx = list.indexOf(n);
  const p = S.p[n] || {};
  const done = isDone(w);
  const title = w.s === 'new' ? `${w.d}일차 · ${idx + 1}/${list.length}` : `기존 단어 #${w.n}`;
  setTop(title, { back: true });
  const long = [...w.w].length > 3;
  const chips = [...new Set(w.et || [])].map(t => {
    const hit = W.find(x => x.hz === t);
    const isNew = hit && hit.s === 'new' && hit.n !== w.n;
    return `<button class="chip ${isNew ? 'new' : ''}" ${hit ? `data-go="card/${hit.n}"` : ''}>${esc(t)}</button>`;
  }).join('');
  const gl = (w.g || []).map(id => GBYID.get(id)).filter(Boolean);
  const ck = (key, label) => `<button class="ck ${p[key] ? 'on' : ''}" data-act="ck" data-key="${key}"><span class="box">✓</span>${label}</button>`;
  view(`
  <div class="fc" id="fc">
    <div class="meta">
      <span class="pill">#${w.n}</span>
      ${w.s === 'new' ? `<span class="pill pri">새 단어 · HSK ${w.lv}급</span>` : `<span class="pill blue">기존 단어장</span>`}
      ${done ? `<span class="pill mint">학습 완료</span>` : ''}
    </div>
    <button class="star ${isHard(w) ? 'on' : ''}" data-act="star" aria-label="어려운 단어">⭐</button>
    <div class="big ${long ? 'long' : ''}">${hzHTML(w)}</div>
    <div class="bpy">${pyHTML(w)}</div>
    <div class="bko">${esc(w.k)}</div>
    <div class="audio-row">
      <button class="abtn" data-act="play" data-k="w">🔊 단어 듣기</button>
      <button class="abtn slow" data-act="play" data-k="w" data-slow="1">🐢 느리게</button>
    </div>
    <div class="audio-row"><button class="abtn mic" data-act="speak" data-k="w">🎤 따라 말하기</button></div>
    <div id="spk-w" class="spres"></div>
    <div class="exbox">
      <div class="lab">예문</div>
      <div class="exz">${esc(w.ez)}</div>
      ${S.set.py && w.ep ? `<div class="exp">${esc(w.ep)}</div>` : ''}
      <div class="exk">${esc(w.ek || '')}</div>
      <div class="audio-row" style="justify-content:flex-start">
        <button class="abtn" data-act="play" data-k="e">🔊 예문 듣기</button>
        <button class="abtn slow" data-act="play" data-k="e" data-slow="1">🐢 느리게</button>
        <button class="abtn mic" data-act="speak" data-k="e">🎤 따라 말하기</button>
      </div>
      <div id="spk-e" class="spres"></div>
      ${gcHTML(w)}
      ${chips ? `<div class="lab mt8">예문에 쓰인 단어</div><div class="chips">${chips}</div>` : ''}
    </div>
    ${gl.filter(g => !w.gc || g.id !== w.gc.g).map(g => `<button class="gram-link" data-go="g/${g.id}">🧩 <span>관련 문법 · ${esc(g.ko)}</span><span class="go">›</span></button>`).join('')}
    <div class="checks">
      ${ck('wh', '🔊 단어 듣기 1회')}
      ${ck('ws', '🗣️ 단어 따라 말하기 1회')}
      ${ck('eh', '🔊 예문 듣기 1회')}
      ${ck('es', '🗣️ 예문 따라 말하기 1회')}
      <button class="ck final ${done ? 'on' : ''}" data-act="done"><span class="box">✓</span>최종 학습 완료</button>
    </div>
    ${(w.notes || w.orig || w.dupOf || w.rv) ? `<details class="more-info"><summary>단어장 정리 메모</summary>
      ${w.notes ? `<div>· ${w.notes.map(esc).join('<br>· ')}</div>` : ''}
      ${w.orig ? `<div>· 원래 예문: <span class="zh">${esc(w.orig)}</span></div>` : ''}
      ${w.dupOf ? `<div>· 기존 단어장 안 중복: ${w.dupOf.map(x => `#${x}`).join(', ')}</div>` : ''}
      ${w.rv ? `<div>· 검토 메모: ${esc(w.rv)}</div>` : ''}
    </details>` : ''}
  </div>
  <div class="navrow">
    <button class="btn sec" data-act="prev" ${idx <= 0 ? 'disabled' : ''}>‹ 이전 단어</button>
    <button class="btn" data-act="next">${idx >= list.length - 1 ? '목록으로' : '다음 단어 ›'}</button>
  </div>
  `);
  // swipe
  const fc = $('#fc'); let sx = null, sy = null;
  fc.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  fc.addEventListener('touchend', e => {
    if (sx == null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) { dx < 0 ? cardMove(1) : cardMove(-1); }
  }, { passive: true });
}
function gcHTML(w) {
  const x = w.gc; if (!x || !x.c) return '';
  const g = x.g ? GBYID.get(x.g) : null;
  return g ? `<button class="gcomment" data-go="g/${g.id}"><b>📘 HSK 3급 문법 · ${esc(g.ko)}</b><span>${esc(x.c)}</span><i>›</i></button>`
    : `<div class="gcomment tip"><b>💡 문형 팁</b><span>${esc(x.c)}</span></div>`;
}
function cardMove(step) {
  const n = +location.hash.split('/')[1];
  const { list, mode } = cardCtx;
  const i = list.indexOf(n) + step;
  if (i < 0) return;
  if (i >= list.length) { const w = BYN.get(n); history.back(); return; }
  nav(`card/${list[i]}${mode ? '/' + mode : ''}`, true);
}

/* ---------- PRACTICE ---------- */
const QTYPES = [
  { id: 'listen', ic: '🎧', t: '단어 발음 듣고 고르기', d: '발음을 듣고 맞는 단어·뜻 고르기' },
  { id: 'match', ic: '🔗', t: '뜻 짝짓기', d: '중국어와 한국어 뜻을 연결하기' },
  { id: 'blank', ic: '🕳️', t: '빈칸 채우기', d: '예문을 듣고 빈칸에 들어갈 단어 고르기' },
  { id: 'read', ic: '📝', t: '독해·쓰기', d: '문장 뜻 고르기 + 뜻 보고 중국어 쓰기' },
  { id: 'build', ic: '🧱', t: '중국어 문장 조합하기', d: '한국어를 보고, 문장을 들으며 블록으로 완성' },
];
const POOLS = [['today', '오늘 단어'], ['learned', '배운 단어'], ['hard', '⭐ 어려운'], ['wrong', '틀린 단어'], ['all', '전체']];
function poolWords(k) {
  const cd = curDay();
  if (k === 'today') return dayWords(cd);
  if (k === 'hard') return hardList();
  if (k === 'wrong') return W.filter(w => S.ww[w.n] > 0);
  if (k === 'all') return W;
  return learnedPool();
}
function vPractice() {
  setTab('practice'); setTop('연습');
  const pk = S.set.pool || 'today';
  const n = poolWords(pk).length;
  const last = S.qlog.slice(-5).reverse();
  view(`
  <div class="seg" id="poolseg">${POOLS.map(([k, l]) => `<button class="${k === pk ? 'on' : ''}" data-act="pool" data-k="${k}">${l}</button>`).join('')}</div>
  <p class="count">${POOLS.find(x => x[0] === pk)[1]} ${n}개에서 문제를 만들어요${n < 4 ? ' · 문제를 만들려면 4개 이상 필요해요' : ''}</p>
  <div class="menu">${QTYPES.map(q => `<button class="mi" data-go="quiz/${q.id}/${pk}" ${n < 4 ? 'disabled style="opacity:.5"' : ''}><span class="ic">${q.ic}</span><div><b>${q.t}</b><span>${q.d}</span></div><span class="go">›</span></button>`).join('')}
    <button class="mi" data-go="gq/mix"><span class="ic" style="background:var(--blue-50)">🧩</span><div><b>문법 문제 섞어 풀기</b><span>배운 문법에서 6가지 유형으로 출제</span></div><span class="go">›</span></button>
  </div>
  ${last.length ? `<div class="sec-h"><h2>최근 연습 결과</h2></div><div class="card">${last.map(l => `<div class="set-row"><span>${esc(l.t)}</span><span class="muted small">${l.d.slice(5).replace('-', '/')} · <b style="color:var(--ink)">${l.c}/${l.n}</b></span></div>`).join('')}</div>` : ''}
  `);
}

/* quiz engine */
let Q = null;
function makeQuestions(type, pool) {
  const ws = pool.filter(w => w.k);
  const N = 10;
  const qs = [];
  if (type === 'listen') {
    for (const w of pick(ws.filter(w => w.isZh), N)) {
      const others = pick(uniqBy(W.filter(x => x.isZh && x.hz !== w.hz && x.k !== w.k), x => x.hz), 3);
      qs.push({ type, w, opts: shuffle([w, ...others]), mode: Math.random() < .5 ? 'hz' : 'ko' });
    }
  } else if (type === 'match') {
    const sel = pick(uniqBy(ws, x => x.hz), Math.min(10, ws.length));
    for (let i = 0; i < sel.length; i += 5) { const g = sel.slice(i, i + 5); if (g.length >= 3) qs.push({ type, set: g }); }
  } else if (type === 'blank') {
    const cand = ws.filter(w => w.isZh && w.ez.includes(w.hz) && w.ez.replace(/[^㐀-鿿]/g, '').length > w.hz.length + 1);
    for (const w of pick(cand, N)) {
      const others = pick(uniqBy(W.filter(x => x.isZh && x.hz !== w.hz && !w.ez.includes(x.hz) && [...x.hz].length === [...w.hz].length), x => x.hz), 3);
      const others2 = others.length < 3 ? pick(W.filter(x => x.isZh && x.hz !== w.hz && !w.ez.includes(x.hz)), 3 - others.length) : [];
      qs.push({ type, w, opts: shuffle([w, ...others, ...others2]) });
    }
  } else if (type === 'read') {
    for (const w of pick(ws.filter(w => w.isZh && w.ek), N)) {
      if (Math.random() < .5) {
        const others = pick(W.filter(x => x.ek && x.ek !== w.ek && x.n !== w.n), 3);
        qs.push({ type: 'readko', w, opts: shuffle([w, ...others]) });
      } else qs.push({ type: 'write', w });
    }
  } else if (type === 'build') {
    const strip = z => z.replace(/[^㐀-鿿]/g, '');
    const cand = [];
    for (const w of ws) {
      if (w.et && w.et.length >= 3 && w.et.length <= 10 && w.et.join('') === strip(w.ez) && w.ek) cand.push({ w, toks: w.et, z: w.ez, p: w.ep, k: w.ek, gc: w.gc && w.gc.g ? w.gc : null });
    }
    for (const c of uniqBy(pick(cand, N * 2), c => c.w.n).slice(0, N)) qs.push({ type, ...c });
  }
  return qs;
}
function vQuiz(type, poolKey) {
  setTab('practice');
  const meta = QTYPES.find(q => q.id === type);
  if (!meta) return nav('practice', true);
  const pool = poolWords(poolKey);
  const qs = makeQuestions(type, pool);
  if (!qs.length) { setTop(meta.t, { back: true }); view(`<div class="empty"><div class="e">🙈</div>이 범위에서는 문제를 만들 수 있는 단어가 부족해요.<br>다른 범위를 골라 주세요.</div>`); return; }
  Q = { type, title: meta.t, qs, i: 0, c: 0, n: qs.length, wrong: [], kind: 'word', back: 'practice' };
  setTop(meta.t, { back: true });
  renderQ();
}
function qHeader() { return `<div class="qtop"><div class="qbar"><i style="width:${Q.i / Q.n * 100}%"></i></div><span class="qcount">${Q.i + 1}/${Q.n}</span></div>`; }
function renderQ() {
  if (Q.i >= Q.n) return renderResult();
  const q = Q.qs[Q.i]; Q.answered = false;
  let html = qHeader();
  if (q.type === 'listen') {
    html += `<div class="qcard"><div class="qlab">발음을 듣고 맞는 ${q.mode === 'hz' ? '단어' : '뜻'}를 고르세요</div>
      <button class="bigspk" data-act="qsay" data-t="${esc(q.w.hz)}">🔊</button>
      <div class="audio-row"><button class="abtn slow" data-act="qsay" data-t="${esc(q.w.hz)}" data-slow="1">🐢 느리게 다시 듣기</button></div></div>
      <div class="opts ${q.mode === 'hz' ? 'two' : ''}">${q.opts.map((o, i) => `<button class="opt" data-act="ans" data-i="${i}">${q.mode === 'hz' ? `<span class="zh">${esc(o.hz)}</span>` : esc(o.k)}</button>`).join('')}</div><div id="fb"></div>`;
    view(html); setTimeout(() => TTS.speak(q.w.hz, false, $('.bigspk')), 250);
  } else if (q.type === 'match') {
    const L = shuffle(q.set), R = shuffle(q.set);
    html += `<div class="qcard"><div class="qlab">중국어와 뜻을 짝지어 보세요 · 실수 <b id="miss">0</b></div></div>
      <div class="match"><div class="opts">${L.map(w => `<button class="opt" data-act="mL" data-n="${w.n}"><span class="zh">${esc(w.hz)}</span></button>`).join('')}</div>
      <div class="opts">${R.map(w => `<button class="opt" data-act="mR" data-n="${w.n}" style="font-size:14px">${esc(w.k)}</button>`).join('')}</div></div><div id="fb"></div>`;
    q.left = q.set.length; q.miss = 0; q.sel = null;
    view(html);
  } else if (q.type === 'blank') {
    const parts = q.w.ez.split(q.w.hz);
    const sent = esc(parts[0]) + `<span class="blank" id="blank">　　</span>` + esc(parts.slice(1).join(q.w.hz));
    html += `<div class="qcard"><div class="qlab">예문을 듣고 빈칸에 들어갈 단어를 고르세요</div>
      <div class="audio-row"><button class="abtn" data-act="qsay" data-t="${esc(q.w.ez)}">🔊 예문 듣기</button><button class="abtn slow" data-act="qsay" data-t="${esc(q.w.ez)}" data-slow="1">🐢 느리게</button></div>
      <div class="qz mt8">${sent}</div><div class="muted mt8">${esc(q.w.ek)}</div></div>
      <div class="opts two">${q.opts.map((o, i) => `<button class="opt" data-act="ans" data-i="${i}"><span class="zh">${esc(o.hz)}</span></button>`).join('')}</div><div id="fb"></div>`;
    view(html);
  } else if (q.type === 'readko') {
    html += `<div class="qcard"><div class="qlab">문장을 읽고 알맞은 뜻을 고르세요</div><div class="qz">${esc(q.w.ez)}</div>
      <div class="audio-row"><button class="abtn" data-act="qsay" data-t="${esc(q.w.ez)}">🔊 듣기</button></div></div>
      <div class="opts">${q.opts.map((o, i) => `<button class="opt" data-act="ans" data-i="${i}" style="font-size:15px">${esc(o.ek)}</button>`).join('')}</div><div id="fb"></div>`;
    view(html);
  } else if (q.type === 'write') {
    html += `<div class="qcard"><div class="qlab">뜻을 보고 중국어 단어를 써 보세요</div><div class="qko">${esc(q.w.k)}</div>
      <button class="note" data-act="hint" style="text-decoration:underline">병음 힌트 보기</button><div id="hint" class="muted"></div></div>
      <input class="inp" id="winp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="汉字 입력">
      <p class="note">아이폰 중국어(간체) 키보드나 손글씨 키보드로 입력해요. 병음으로 써도 확인해 줘요.</p>
      <button class="btn mt8" data-act="wcheck">정답 확인</button><div id="fb"></div>`;
    view(html);
  } else if (q.type === 'build') {
    q.built = [];
    q.shuf = shuffle(q.toks.map((t, i) => ({ t, i })));
    if (q.toks.length > 1 && q.shuf.every((x, i) => x.i === i)) q.shuf.reverse();
    const listen = !q.x;
    html += listen
      ? `<div class="qcard"><div class="qlab">한국어 문장을 보고 중국어 문장을 완성하세요</div><div class="qko">${esc(q.k)}</div>
        <div class="audio-row mt8"><button class="abtn" data-act="qsay" data-t="${esc(q.z)}">🔊 중국어 문장 듣기</button><button class="abtn slow" data-act="qsay" data-t="${esc(q.z)}" data-slow="1">🐢 느리게</button></div></div>`
      : `<div class="qcard"><div class="qlab">${q.lab}</div><div class="qko">${esc(q.k)}</div><div class="qz mt8" style="text-decoration:line-through;text-decoration-color:var(--red);font-size:20px">${esc(q.x)}</div></div>`;
    html += `
      <div class="answer" id="ans"></div>
      <div class="blocks" id="blocks">${q.shuf.map((b, j) => `<button class="blk" data-act="blk" data-j="${j}">${esc(b.t)}</button>`).join('')}</div>
      <div class="row2"><button class="btn sec" data-act="bclear">다시 놓기</button><button class="btn" data-act="bcheck">정답 확인</button></div><div id="fb"></div>`;
    view(html);
  }
}
function nextBtn() { return `<button class="btn mt12" data-act="qnext">${Q.i + 1 >= Q.n ? '결과 보기' : '다음 문제 ›'}</button>`; }
function mark(ok, w) {
  if (ok) Q.c++;
  else Q.wrong.push(w);
  if (w && Q.kind === 'word') { S.ww[w.n] = Math.max(0, (S.ww[w.n] || 0) + (ok ? -1 : 1)); if (!S.ww[w.n]) delete S.ww[w.n]; save(); }
}
function explainWord(w) {
  return `<div class="mt8"><span class="zh" style="font-size:20px">${esc(w.w)}</span> <span class="muted">${esc(w.p)}</span> · ${esc(w.k)}</div>
  <div class="zh mt8" style="font-size:17px">${esc(w.ez)}</div><div class="small muted">${esc(w.ep || '')}</div><div class="small">${esc(w.ek || '')}</div>
  <div class="audio-row" style="justify-content:flex-start"><button class="abtn" data-act="qsay" data-t="${esc(w.ez)}">🔊 예문 듣기</button><button class="abtn slow" data-act="star2" data-n="${w.n}">${isHard(w) ? '⭐ 어려운 단어' : '☆ 어려운 단어로'}</button></div>`;
}
function renderResult() {
  const pct = Math.round(Q.c / Q.n * 100);
  S.qlog.push({ t: Q.title, d: today(), c: Q.c, n: Q.n }); if (S.qlog.length > 200) S.qlog = S.qlog.slice(-200); save();
  const wr = uniqBy(Q.wrong.filter(Boolean), x => x.n || x.id);
  view(`<div class="card result"><div class="qlab">${esc(Q.title)}</div><div class="score">${Q.c}/${Q.n}</div>
    <div>${pct >= 90 ? '완벽해요! 🎉' : pct >= 70 ? '잘했어요! 👏' : '틀린 문제를 다시 보고 한 번 더 해 봐요 💪'}</div></div>
    ${wr.length ? `<div class="sec-h"><h2>틀린 문제 ${wr.length}개</h2></div><div class="wl">${Q.kind === 'word' ? wr.map(wordRow).join('') : wr.map(g => `<button class="gi" data-go="g/${g.id}"><span class="gn">${g.id}</span><span class="gt"><b>${esc(g.ko)}</b><span>${esc(g.zh)}</span></span></button>`).join('')}</div>` : ''}
    <div class="row2"><button class="btn sec" data-go="${Q.back}">목록으로</button><button class="btn" data-act="qagain">한 번 더</button></div>`);
  $('.qbar i') && ($('.qbar i').style.width = '100%');
}

/* ---------- DICT ---------- */
let DQ = { q: '', src: 'all', st: 'all', hard: false, lv: 0, limit: 80 };
function dictFilter() {
  const q = DQ.q.trim();
  let r = W;
  if (DQ.src !== 'all') r = r.filter(w => w.s === DQ.src);
  if (DQ.st === 'done') r = r.filter(isDone); else if (DQ.st === 'todo') r = r.filter(w => !isDone(w));
  if (DQ.hard) r = r.filter(isHard);
  if (DQ.lv) r = r.filter(w => w.lv === DQ.lv);
  if (q) {
    if (/^\d+$/.test(q)) r = r.filter(w => String(w.n).startsWith(q)).sort((a, b) => (String(a.n) === q ? -1 : 0) - (String(b.n) === q ? -1 : 0));
    else if (/[㐀-鿿]/.test(q)) r = r.filter(w => w.w.includes(q)).sort((a, b) => (a.hz === q ? -1 : 0) - (b.hz === q ? -1 : 0) || a.w.length - b.w.length);
    else if (/[가-힣]/.test(q)) r = r.filter(w => w.k.includes(q));
    else { const t = toneless(q); const raw = q.toLowerCase().replace(/\s/g, ''); r = r.filter(w => w.pts.some(p => p.includes(t)) || (w.p || '').toLowerCase().replace(/\s/g, '').includes(raw)).sort((a, b) => (a.pt === t ? -1 : 0) - (b.pt === t ? -1 : 0) || a.pt.length - b.pt.length); }
  }
  return r;
}
function vDict() {
  setTab('dict'); setTop('전체 단어장');
  const fb = (k, v, l) => `<button class="fbtn ${DQ[k] === v ? 'on' : ''}" data-act="df" data-k="${k}" data-v="${v}">${l}</button>`;
  view(`
  <div class="search">
    <div class="sbox"><span>🔎</span><input id="dq" type="search" inputmode="search" placeholder="한자 · 병음 · 뜻 · 번호로 검색" value="${esc(DQ.q)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
    <div class="filters">
      ${fb('src', 'all', '전체')}${fb('src', 'old', '기존 단어')}${fb('src', 'new', '새 단어')}
      ${fb('st', 'done', '학습 완료')}${fb('st', 'todo', '미완료')}
      <button class="fbtn ${DQ.hard ? 'on' : ''}" data-act="dhard">⭐ 어려운</button>
      ${[1, 2, 3].map(l => fb('lv', l, `HSK ${l}급 새 단어`)).join('')}
    </div>
  </div>
  <div id="dres"></div>`);
  const inp = $('#dq');
  let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { DQ.q = inp.value; DQ.limit = 80; renderDict(); }, 150); });
  renderDict();
}
function renderDict() {
  const r = dictFilter();
  const box = $('#dres'); if (!box) return;
  box.innerHTML = `<p class="count">${r.length}개 단어${DQ.q ? ` · "${esc(DQ.q)}" 검색 결과` : ''}</p>
  ${r.length ? `<div class="wl">${r.slice(0, DQ.limit).map(wordRow).join('')}</div>` : `<div class="empty"><div class="e">🔍</div>검색 결과가 없어요</div>`}
  ${r.length > DQ.limit ? `<button class="btn sec" data-act="dmore">더 보기 (${r.length - DQ.limit}개 남음)</button>` : ''}`;
}

/* ---------- GRAMMAR ---------- */
const gst = id => S.g[id] || (S.g[id] = {});
function vGrammarList() {
  setTab('grammar'); setTop('HSK 3급 문법');
  const learned = G.filter(g => (S.g[g.id] || {}).l).length;
  const hard = G.filter(g => (S.g[g.id] || {}).h).length;
  const wrong = G.filter(g => S.gw[g.id] > 0).length;
  const f = S.set.gf || 'all';
  const list = G.filter(g => f === 'all' || (f === 'todo' && !(S.g[g.id] || {}).l) || (f === 'done' && (S.g[g.id] || {}).l) || (f === 'hard' && (S.g[g.id] || {}).h) || (f === 'wrong' && S.gw[g.id] > 0));
  const fb = (v, l) => `<button class="fbtn ${f === v ? 'on' : ''}" data-act="gf" data-v="${v}">${l}</button>`;
  view(`
  <div class="stats">
    <div class="stat mint"><b>${learned}</b><span>배운 문법<br><small class="muted">/ ${G.length}</small></span></div>
    <div class="stat gold"><b>${hard}</b><span>어려운 문법</span></div>
    <div class="stat pri"><b>${wrong}</b><span>틀린 문법</span></div>
  </div>
  <div class="row2" style="margin-bottom:12px"><button class="btn sm" data-go="gq/mix">🧩 섞어 풀기</button><button class="btn sec sm" data-go="gq/wrong" ${wrong ? '' : 'disabled'}>틀린 문제 다시</button></div>
  <div class="filters" style="margin-bottom:8px">${fb('all', '전체')}${fb('todo', '아직 안 배움')}${fb('done', '배움')}${fb('hard', '⭐ 어려운')}${fb('wrong', '틀린 문법')}</div>
  <div class="wl">${list.map(g => { const s = S.g[g.id] || {}; return `<button class="gi ${s.l ? 'learned' : ''}" data-go="g/${g.id}"><span class="gn">${s.l ? '✓' : g.id}</span><span class="gt"><b>${esc(g.ko)}</b><span>${esc(g.zh)}</span></span>${s.h ? '⭐' : ''}${S.gw[g.id] > 0 ? '<span class="pill red">틀림</span>' : ''}<span class="muted">›</span></button>`; }).join('') || `<div class="empty">해당하는 문법이 없어요</div>`}</div>
  <p class="note">문법 72개는 보내준 'HSK 3级语法' 자료 순서 그대로예요. 설명은 한국어로 새로 정리했어요.</p>`);
}
function vGrammar(id) {
  const g = GBYID.get(id);
  if (!g) return nav('grammar', true);
  setTab('grammar');
  const s = S.g[id] || {};
  setTop(`문법 ${id} / ${G.length}`, { back: true });
  const related = W.filter(w => (w.g || []).includes(id)).sort((a, b) => (b.s === 'new') - (a.s === 'new')).map(w => ({ w, z: w.ez, k: w.ek, kind: 'e' })).slice(0, 15);
  view(`
  <div class="card">
    <div style="display:flex;gap:8px;align-items:flex-start"><h2 style="margin:0;font-size:20px;flex:1">${esc(g.ko)}</h2>
    <button class="star ${s.h ? 'on' : ''}" data-act="gstar" style="position:static;width:44px;height:44px;flex:none">⭐</button></div>
    <div class="muted zh small mt8">${esc(g.zh)}</div>
    <p style="margin:10px 0">${esc(g.mean)}</p>
    <div class="struct">${esc(g.struct)}</div>
    <div class="sk">👉 ${esc(g.sk)}</div>
  </div>
  <div class="card">
    <div class="qlab" style="text-align:left">예문</div>
    ${g.ex.map((e, i) => `<div class="gex"><div class="row"><div class="t"><div class="exz">${esc(e.z)}</div>${S.set.py ? `<div class="exp">${esc(e.p)}</div>` : ''}<div class="exk">${esc(e.k)}</div></div>
      <div style="display:grid;gap:6px"><button class="spk" data-act="gsay" data-i="${i}">🔊</button><button class="spk" style="background:var(--blue-50)" data-act="gsay" data-i="${i}" data-slow="1">🐢</button></div></div></div>`).join('')}
  </div>
  <div class="warn"><b>⚠️ 헷갈리기 쉬운 부분</b><br>${esc(g.warn)}</div>
  <div class="wrongbox"><b>❌ → ⭕ 자주 하는 실수</b><div class="x mt8">${esc(g.wrong.x)}</div><div class="o">${esc(g.wrong.o)}</div><div class="small mt8">${esc(g.wrong.why)}</div></div>
  ${g.zhExpl && g.zhExpl.length ? `<details class="more-info card" style="margin-top:12px"><summary>원본 자료 설명 (중국어)</summary><div class="zh mt8" style="line-height:1.7">${g.zhExpl.map(esc).join('<br>')}</div></details>` : ''}
  ${related.length ? `<div class="sec-h"><h2>이 문법이 쓰인 단어 예문</h2></div><div class="wl">${related.map(r => `<div class="wi" data-go="card/${r.w.n}"><div class="body"><div class="zh" style="font-size:17px">${esc(r.z)}</div><div class="ko">${esc(r.w.hz)} · ${esc(r.k)}</div></div>${spkBtn(r.w.n, r.kind)}</div>`).join('')}</div>` : ''}
  <div class="toggle-row mt12">
    <button class="btn ${s.l ? 'mint' : 'sec'}" data-act="glearn">${s.l ? '✓ 배운 문법' : '배운 문법으로 체크'}</button>
    <button class="btn" data-go="gq/${id}">연습 문제 ›</button>
  </div>
  <div class="navrow">
    <button class="btn sec sm" data-go="g/${id - 1}" ${id <= 1 ? 'disabled' : ''}>‹ 이전 문법</button>
    <button class="btn sec sm" data-go="g/${id + 1}" ${id >= G.length ? 'disabled' : ''}>다음 문법 ›</button>
  </div>`);
}
const CONFUSE = [['的', '得', '地'], ['又', '再', '还'], ['才', '就', '都'], ['还是', '或者', '而且'], ['不', '没', '别'], ['以前', '以后', '的时候'], ['只有', '只要', '如果'], ['看来', '看起来', '看见'], ['越来越', '越', '更'], ['被', '把', '给'], ['比', '跟', '和'], ['起来', '下去', '出来'], ['一边', '一起', '一下'], ['虽然', '因为', '所以'], ['为了', '因为', '关于'], ['已经', '刚', '马上'], ['一点儿也不', '有点儿', '一下']];
function gQuestions(ids) {
  const qs = [];
  const allKeys = [...new Set(G.flatMap(g => g.keys))];
  const allEx = G.flatMap(g => g.ex.map(e => ({ ...e, gid: g.id })));
  for (const id of ids) {
    const g = GBYID.get(id);
    const exs = g.ex.filter(e => e.t && e.t.length);
    const withKey = exs.map(e => ({ e, k: g.keys.find(k => e.z.includes(k)) })).filter(x => x.k);
    const types = shuffle(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
    for (const t of types.slice(0, ids.length === 1 ? 6 : 1)) {
      if ((t === 'g1' || t === 'g2') && withKey.length) {
        const { e, k } = pick(withKey, 1)[0];
        let opts;
        const grp = CONFUSE.find(c => c.includes(k));
        if (t === 'g2' && grp) opts = shuffle(uniqBy([k, ...grp.filter(x => x !== k)], x => x)).slice(0, 3);
        else opts = shuffle([k, ...pick(allKeys.filter(x => x !== k && !e.z.includes(x) && !k.includes(x) && !x.includes(k)), 3)]);
        if (!opts.includes(k)) opts[0] = k;
        qs.push({ type: 'gblank', g, e, k, opts: shuffle(opts), lab: t === 'g1' ? '문법에 맞는 단어를 고르세요' : '빈칸에 들어갈 말을 고르세요' });
      } else if (t === 'g3') {
        const e = pick(exs, 1)[0];
        const toks = e.t;
        const d = [];
        if (g.wrong.o === e.z) d.push(g.wrong.x);
        for (let tries = 0; d.length < 2 && tries < 20 && toks.length > 1; tries++) {
          const a = toks.slice(); const i = Math.random() * (a.length - 1) | 0;[a[i], a[i + 1]] = [a[i + 1], a[i]];
          const s = a.join('') + (e.z.match(/[。？！]$/) || ['。'])[0];
          if (s !== e.z && !d.includes(s)) d.push(s);
        }
        if (d.length < 1) continue;
        qs.push({ type: 'gpick', g, e, opts: shuffle([e.z, ...d]) });
      } else if (t === 'g4' || (t === 'g1' || t === 'g2')) {
        const e = pick(exs, 1)[0];
        if (e.t.length < 2) continue;
        qs.push({ type: 'build', g, toks: e.t, z: e.z, p: e.p, k: e.k, lab: '한국어 문장을 보고 단어 블록으로 문장을 만드세요' });
      } else if (t === 'g5') {
        qs.push({ type: 'build', g, toks: g.wrong.t, z: g.wrong.o, p: g.wrong.op, k: '틀린 문장을 바르게 고쳐 보세요', x: g.wrong.x, why: g.wrong.why, lab: '틀린 문장 고치기 — 블록을 바른 순서로 놓으세요' });
      } else if (t === 'g6') {
        const e = pick(exs, 1)[0];
        const others = pick(allEx.filter(x => x.k !== e.k), 3);
        qs.push({ type: 'gmean', g, e, opts: shuffle([e, ...others]) });
      }
    }
  }
  return shuffle(qs);
}
function vGQuiz(which) {
  setTab('grammar');
  let ids, title;
  if (which === 'mix') { const l = G.filter(g => (S.g[g.id] || {}).l).map(g => g.id); ids = pick(l.length >= 4 ? l : G.map(g => g.id).slice(0, Math.max(4, l.length)), 10); title = l.length >= 4 ? '배운 문법 섞어 풀기' : '문법 섞어 풀기 (앞 단원)'; }
  else if (which === 'wrong') { ids = pick(G.filter(g => S.gw[g.id] > 0).map(g => g.id), 10); title = '틀린 문법 다시 풀기'; }
  else { ids = [+which]; title = `문법 ${which} 연습`; }
  if (!ids.length) return nav('grammar', true);
  const qs = gQuestions(ids);
  Q = { type: 'grammar', title, qs, i: 0, c: 0, n: qs.length, wrong: [], kind: 'grammar', back: which === 'mix' || which === 'wrong' ? 'grammar' : `g/${which}`, which };
  setTop(title, { back: true });
  renderGQ();
}
function renderGQ() {
  if (Q.i >= Q.n) return renderResult();
  const q = Q.qs[Q.i]; Q.answered = false;
  if (q.type === 'build') return renderQ();
  let html = qHeader();
  if (q.type === 'gblank') {
    const i = q.e.z.indexOf(q.k);
    const sent = esc(q.e.z.slice(0, i)) + `<span class="blank" id="blank">　　</span>` + esc(q.e.z.slice(i + q.k.length));
    html += `<div class="qcard"><div class="qlab">${q.lab}</div><div class="qz">${sent}</div><div class="muted mt8">${esc(q.e.k)}</div></div>
      <div class="opts ${q.opts.length === 4 ? 'two' : ''}">${q.opts.map((o, j) => `<button class="opt" data-act="gans" data-j="${j}"><span class="zh">${esc(o)}</span></button>`).join('')}</div><div id="fb"></div>`;
  } else if (q.type === 'gpick') {
    html += `<div class="qcard"><div class="qlab">한국어 뜻에 맞는 중국어 문장을 고르세요</div><div class="qko">${esc(q.e.k)}</div></div>
      <div class="opts">${q.opts.map((o, j) => `<button class="opt" data-act="gans" data-j="${j}"><span class="zh" style="font-size:19px">${esc(o)}</span></button>`).join('')}</div><div id="fb"></div>`;
  } else if (q.type === 'gmean') {
    html += `<div class="qcard"><div class="qlab">문장의 뜻을 고르세요</div><div class="qz">${esc(q.e.z)}</div>
      <div class="audio-row"><button class="abtn" data-act="qsay" data-t="${esc(q.e.z)}">🔊 듣기</button></div></div>
      <div class="opts">${q.opts.map((o, j) => `<button class="opt" data-act="gans" data-j="${j}" style="font-size:15px">${esc(o.k)}</button>`).join('')}</div><div id="fb"></div>`;
  }
  view(html);
}
function gExplain(q, e) {
  e = e || q.e;
  return `<div class="zh mt8" style="font-size:18px">${esc(e.z)}</div><div class="small muted">${esc(e.p || '')}</div><div class="small">${esc(e.k || '')}</div>
  <div class="small mt8">🧩 <b>${esc(q.g.ko)}</b> — ${esc(q.g.sk)}</div>
  <div class="audio-row" style="justify-content:flex-start"><button class="abtn" data-act="qsay" data-t="${esc(e.z)}">🔊 듣기</button><button class="abtn slow" data-go="g/${q.g.id}">문법 설명 보기</button></div>`;
}
function gMark(ok, g) {
  if (ok) Q.c++; else Q.wrong.push(g);
  S.gw[g.id] = Math.max(0, (S.gw[g.id] || 0) + (ok ? -1 : 1)); if (!S.gw[g.id]) delete S.gw[g.id];
  save();
}

/* ---------- HARD ---------- */
function vHard() {
  setTab('hard'); setTop('어려운 단어');
  const hl = hardList();
  const hide = S.set.mean === 'hide';
  const hg = G.filter(g => (S.g[g.id] || {}).h);
  view(`
  <div class="seg"><button class="${!hide ? 'on' : ''}" data-act="mean" data-v="show">뜻 보기</button><button class="${hide ? 'on' : ''}" data-act="mean" data-v="hide">뜻 가리기</button></div>
  ${hl.length ? `<p class="count">⭐ ${hl.length}개 · 입에 붙으면 '완료 ✓'를 눌러 목록에서 빼세요</p>
  ${hl.map(w => `<div class="hard-item" id="h${w.n}">
    <div class="top-r"><span class="hz">${esc(w.w)}</span>${spkBtn(w.n)}<button class="spk" style="background:var(--blue-50)" data-act="say" data-n="${w.n}" data-k="w" data-slow="1">🐢</button></div>
    ${hide ? `<button class="reveal" data-act="reveal" data-n="${w.n}">눌러서 정답 확인</button><div class="ans" hidden>` : '<div class="ans">'}
      <div><span class="muted">${esc(w.p)}</span> · <b>${esc(w.k)}</b></div>
      <div class="zh mt8" style="font-size:17px">${esc(w.ez)}</div><div class="small muted">${esc(w.ek || '')}</div>
    </div>
    <div class="acts"><button data-act="say" data-n="${w.n}" data-k="e">🔊 예문</button><button data-go="card/${w.n}/h">다시 학습</button><button class="ok" data-act="unhard" data-n="${w.n}">완료 ✓</button></div>
  </div>`).join('')}
  <div class="row2"><button class="btn sec sm" data-go="card/${hl[0].n}/h">카드로 넘기며 복습</button><button class="btn sm" data-act="hardquiz">⭐ 단어로 연습</button></div>`
      : `<div class="empty"><div class="e">⭐</div>아직 어려운 단어가 없어요.<br>단어 카드 오른쪽 위 ⭐를 눌러<br>입에 잘 안 붙는 단어를 모아 보세요.</div>`}
  ${hg.length ? `<div class="sec-h"><h2>어려운 문법 ${hg.length}개</h2></div><div class="wl">${hg.map(g => `<button class="gi" data-go="g/${g.id}"><span class="gn">${g.id}</span><span class="gt"><b>${esc(g.ko)}</b><span>${esc(g.zh)}</span></span>⭐</button>`).join('')}</div>` : ''}
  `);
}

/* ---------- REVIEW ---------- */
function vReview() {
  setTab('home'); setTop('오늘의 복습', { back: true });
  const due = reviewDue();
  if (!due.length) { view(`<div class="empty"><div class="e">🎉</div>오늘 복습할 단어를 다 끝냈어요!</div><button class="btn" data-go="home">홈으로</button>`); return; }
  const w = due[0];
  const st = S.r[w.n].st;
  view(`<p class="count">남은 복습 ${due.length}개 · ${['1일', '3일', '7일'][st]} 복습</p>
  <div class="fc"><div class="big ${[...w.w].length > 3 ? 'long' : ''}">${esc(w.w)}</div>
  <div class="audio-row"><button class="abtn" data-act="play1" data-n="${w.n}">🔊 듣기</button></div>
  <button class="reveal btn sec mt12" data-act="rv-show" id="rvshow">뜻 확인하기</button>
  <div id="rvans" hidden><div class="bpy mt12">${esc(w.p)}</div><div class="bko">${esc(w.k)}</div>
  <div class="exbox"><div class="exz">${esc(w.ez)}</div><div class="exp">${esc(w.ep || '')}</div><div class="exk">${esc(w.ek || '')}</div></div>
  <div class="row2 mt12"><button class="btn sec" data-act="rv" data-n="${w.n}" data-ok="0">다시 볼래요</button><button class="btn mint" data-act="rv" data-n="${w.n}" data-ok="1">기억났어요</button></div></div></div>
  <p class="note">'다시 볼래요'는 내일 다시 나오고, '기억났어요'는 1일 → 3일 → 7일 뒤로 넘어가요. 어려운 단어(⭐)는 직접 표시할 때만 추가돼요.</p>`);
}

/* ---------- PLAN ---------- */
function vPlan() {
  setTab('home'); setTop('학습 일정', { back: true });
  const cd = curDay();
  const rows = [];
  for (let d = 1; d <= MAXDAY; d++) {
    const ws = dayWords(d); const dn = ws.filter(isDone).length;
    rows.push(`<button class="gi ${dn === ws.length ? 'learned' : ''}" data-go="today/${d}"><span class="gn">${dn === ws.length ? '✓' : d}</span><span class="gt"><b>${d}일차 · ${fmtMD(addDays(S.start, d - 1))}${d === cd ? ' <span class="pill pri">오늘</span>' : ''}</b><span>${ws.slice(0, 6).map(w => w.hz).join(' ')}… · HSK ${[...new Set(ws.map(w => w.lv))].join('·')}급</span></span><span class="small muted">${dn}/${ws.length}</span></button>`);
  }
  const left = diffDays(addDays(S.start, MAXDAY - 1), EXAM);
  view(`<div class="card"><div class="set-row"><span>시작일</span><b>${fmtMD(S.start)}</b></div><div class="set-row"><span>새 단어 완주 예정</span><b>${fmtMD(addDays(S.start, MAXDAY - 1))}</b></div>
    <div class="set-row"><span>완주 후 시험까지</span><b>${left >= 0 ? left + '일 총복습' : '시험일을 넘겨요'}</b></div></div>
    ${left < 0 ? `<div class="banner gold">⚠️ 이대로면 시험 전에 새 단어를 다 못 끝내요. 설정에서 시작일을 앞당기거나 미리 학습해 주세요.</div>` : ''}
    <div class="wl">${rows.join('')}</div>`);
}

/* ---------- SETTINGS / BACKUP ---------- */
function vSettings() {
  setTab('home'); setTop('설정 · 백업', { back: true });
  const sw = (k, l) => `<div class="set-row"><span>${l}</span><button class="sw ${S.set[k] ? 'on' : ''}" data-act="sw" data-k="${k}" aria-label="${l}"></button></div>`;
  view(`
  <div class="card">
    <div class="set-row"><span>학습 시작일 (1일차)</span><input type="date" id="sdate" value="${S.start}"></div>
    ${sw('py', '병음 표시')}
    ${sw('tone', '성조별 색 표시')}
    <div class="set-row"><span>보통 속도</span><select id="rate">${[0.7, 0.8, 0.85, 0.9, 1].map(v => `<option ${S.set.rate == v ? 'selected' : ''} value="${v}">${v}배</option>`).join('')}</select></div>
    <div class="set-row"><span>느린 속도</span><select id="slow">${[0.35, 0.45, 0.5, 0.6].map(v => `<option ${S.set.slow == v ? 'selected' : ''} value="${v}">${v}배</option>`).join('')}</select></div>
    <div class="set-row"><span>화면 테마</span><select id="theme">${[['auto', '아이폰 설정 따라감'], ['light', '밝게'], ['dark', '어둡게']].map(([v, l]) => `<option ${S.set.theme === v ? 'selected' : ''} value="${v}">${l}</option>`).join('')}</select></div>
    <div class="set-row"><span>음성 테스트</span><button class="abtn" data-act="ttstest">🔊 你好！</button></div>
  </div>
  <div class="sec-h"><h2>학습 기록 백업</h2></div>
  <div class="card">
    <p class="small" style="margin-top:0">기록은 이 폰의 Safari에 저장돼요. Safari 방문 기록을 지우거나 폰을 바꾸면 사라질 수 있으니 가끔 내보내 두세요.${S.lastBackup ? `<br>마지막 백업: <b>${fmtMD(S.lastBackup)}</b>` : ''}</p>
    <div class="row2"><button class="btn sm" data-act="export">💾 파일로 내보내기</button><button class="btn sec sm" data-act="copy">📋 복사하기</button></div>
    <div class="row2 mt8"><button class="btn sec sm" data-act="importf">📂 파일 가져오기</button><button class="btn sec sm" data-act="importt">📝 붙여넣기로 가져오기</button></div>
    <input type="file" id="ifile" accept=".json,application/json,text/plain" hidden>
  </div>
  <div class="sec-h"><h2>자료 정보</h2></div>
  <div class="card">
    <button class="set-row" style="width:100%" data-go="report"><span>📊 단어 중복 검사 결과</span><span class="muted">›</span></button>
    <div class="set-row"><span>홈 화면에 추가</span><span class="small muted">Safari 공유 → 홈 화면에 추가</span></div>
    <div class="set-row"><span>데이터 버전</span><span class="small muted">${esc(D.version)}</span></div>
  </div>
  <button class="btn sec sm mt12" data-act="reset" style="color:var(--red)">학습 기록 전체 초기화</button>
  `);
  $('#sdate').onchange = e => { if (e.target.value) { S.start = e.target.value; save(); toast('시작일을 바꿨어요'); } };
  $('#rate').onchange = e => { S.set.rate = +e.target.value; save(); };
  $('#slow').onchange = e => { S.set.slow = +e.target.value; save(); };
  $('#theme').onchange = e => { S.set.theme = e.target.value; save(); applyTheme(); };
  $('#ifile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => doImport(r.result); r.readAsText(f); };
}
function exportText() { return JSON.stringify({ app: 'pixie-chinese-studio', v: 1, at: new Date().toISOString(), state: S }); }
async function doExport() {
  const txt = exportText();
  const name = `pixie-chinese-backup-${today()}.json`;
  try {
    const file = new File([txt], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Pixie Chinese 백업' });
      S.lastBackup = today(); save(); toast('백업 파일을 저장했어요'); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  S.lastBackup = today(); save(); toast('백업 파일을 내려받았어요');
}
async function doCopy() {
  const txt = exportText();
  try { await navigator.clipboard.writeText(txt); S.lastBackup = today(); save(); toast('복사했어요. 메모 앱이나 카톡 나와의 채팅에 붙여 두세요'); }
  catch (e) { sheet(`<h3>아래 내용을 길게 눌러 복사하세요</h3><textarea class="code" readonly>${esc(txt)}</textarea><button class="btn mt8" data-act="closesheet">닫기</button>`); S.lastBackup = today(); save(); }
}
function doImport(txt) {
  try {
    const o = JSON.parse(String(txt).trim());
    const st = o.state || o;
    if (!st || typeof st !== 'object' || !st.p) throw new Error('bad');
    if (!confirm('백업한 기록으로 바꿀까요? 지금 기록은 덮어써져요.')) return;
    S = st; load2(); saveNow(); applyTheme(); toast('기록을 가져왔어요'); nav('home');
  } catch (e) { toast('백업 내용을 읽지 못했어요'); }
}
function load2() { const d = DEF(); for (const k in d) if (S[k] === undefined) S[k] = d[k]; for (const k in d.set) if (S.set[k] === undefined) S.set[k] = d.set[k]; }
function vReport() {
  setTab('home'); setTop('단어 중복 검사 결과', { back: true });
  const R = D.report;
  const lvC = { 1: 0, 2: 0, 3: 0 }; NEW.forEach(w => lvC[w.lv]++);
  view(`
  <div class="card"><table class="rep">
    <tr><td>HSK 3.0 자료 단어 수 (1급 300 + 2급 200 + 3급 500, 누적 목록)</td><td>${R.hsk_total}</td></tr>
    <tr><td>기존 단어장 실제 단어 수 (번호 1~573, 487~496 빈 번호)</td><td>${R.old_count}</td></tr>
    <tr><td>두 자료에서 겹치는 단어</td><td>${R.dup_count}</td></tr>
    <tr><td>새로 배울 단어 (1급 ${lvC[1]} · 2급 ${lvC[2]} · 3급 ${lvC[3]})</td><td>${R.new_count}</td></tr>
    <tr><td>최종 전체 단어장</td><td>${R.final_count}</td></tr>
  </table><p class="note">새 단어 번호: 574 ~ ${NEW[NEW.length - 1].n}</p></div>
  <div class="sec-h"><h2>직접 확인한 단어</h2></div>
  <div class="card">${R.review.map(r => `<div class="set-row" style="display:block"><b class="zh">${esc(r.w)}</b> <span class="small">${esc(r.note)}</span></div>`).join('')}</div>
  <div class="sec-h"><h2>예문 규칙</h2></div>
  <div class="card small">
    <p style="margin-top:0">새 단어 예문은 <b>기존 단어장 563개 + 그날까지 배운 새 단어</b>만 쓰도록 단어 단위로 검사했어요.</p>
    <p>기존 단어장 예문에 이미 나온 기초 단어 ${R.knownFromOldEx.length}개(的, 了, 很, 我…)는 아는 단어로 봤어요.</p>
    <p>그 밖에 예외로 허용한 말: <span class="zh">${R.exceptions.map(esc).join(' ')}</span> (숫자와 인명·지명)</p>
    <p class="muted">검사기가 단어를 잘못 나눈 3문장(快乐·安全·不用)은 사람이 확인해서 정상으로 표시했어요.</p>
  </div>
  <div class="sec-h"><h2>겹치는 단어 ${R.dups.length}개</h2></div>
  <div class="card small zh" style="line-height:2">${R.dups.map(d => `<span title="${esc(d.p)}">${esc(d.w)}<sub class="muted">#${d.old.join(',')}</sub></span>`).join(' · ')}</div>
  <div class="sec-h"><h2>기존 단어장 안 중복 ${R.old_internal_dups.length}쌍</h2></div>
  <div class="card small">${R.old_internal_dups.map(g => `<button class="chip" data-go="card/${g[0]}">${esc(BYN.get(g[0]).w)} #${g.join(', #')}</button>`).join(' ')}<p class="note">지우지 않고 그대로 뒀어요.</p></div>
  `);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-go]');
  if (!t || t.disabled) return;
  const act = t.dataset.act;
  if (!act && t.dataset.go != null) {
    if (e.target.closest('[data-act]') && e.target.closest('[data-act]') !== t) return;
    if (location.hash.startsWith('#dict')) scrollMem.dict = window.scrollY;
    nav(t.dataset.go); return;
  }
  e.stopPropagation();
  const n = +t.dataset.n;
  const curN = +location.hash.split('/')[1];
  switch (act) {
    case 'back': if (history.length > 1) history.back(); else nav('home'); break;
    case 'say': { const w = BYN.get(n); sayWord(w, t.dataset.k, !!t.dataset.slow, t); break; }
    case 'start': { const cd = curDay(); const ws = dayWords(cd); const w = ws.find(x => !isDone(x)) || ws[0]; nav(`card/${w.n}/d`); break; }
    case 'play': {
      const w = BYN.get(curN); const k = t.dataset.k;
      sayWord(w, k, !!t.dataset.slow, t);
      const key = k === 'w' ? 'wh' : k === 'e' ? 'eh' : null; const p = prog(w.n);
      if (key && !p[key]) { p[key] = 1; save(); const b = $(`.ck[data-key="${key}"]`); b && b.classList.add('on'); }
      break;
    }
    case 'speak': {
      const w = BYN.get(curN); const k = t.dataset.k;
      const target = k === 'w' ? (w.isZh ? w.hz : w.ez) : w.ez;
      const key = k === 'w' ? 'ws' : 'es';
      MIC.start(target, t, $('#spk-' + k), () => { const p = prog(w.n); if (!p[key]) { p[key] = 1; save(); const b = $(`.ck[data-key="${key}"]`); b && b.classList.add('on'); } });
      break;
    }
    case 'myvoice': { if (MIC.url) { const a = new Audio(MIC.url); a.play().catch(() => { }); } break; }
    case 'ck': { const p = prog(curN); const k = t.dataset.key; p[k] = p[k] ? 0 : 1; t.classList.toggle('on', !!p[k]); save(); break; }
    case 'done': {
      const w = BYN.get(curN); const v = !isDone(w);
      if (v) { const p = prog(w.n); ['wh', 'ws', 'eh', 'es'].forEach(k => p[k] = p[k] ?? 0); }
      setDone(w, v); t.classList.toggle('on', v);
      toast(v ? '학습 완료! 🎉' : '완료를 취소했어요');
      if (v) setTimeout(() => { if (location.hash.startsWith('#card/' + w.n)) cardMove(1); }, 550);
      break;
    }
    case 'star': { const w = BYN.get(curN); if (S.hard[w.n]) delete S.hard[w.n]; else S.hard[w.n] = today(); save(); t.classList.toggle('on', !!S.hard[w.n]); toast(S.hard[w.n] ? '⭐ 어려운 단어에 추가했어요' : '어려운 단어에서 뺐어요'); break; }
    case 'star2': { const w = BYN.get(n); if (S.hard[w.n]) delete S.hard[w.n]; else S.hard[w.n] = today(); save(); t.textContent = S.hard[w.n] ? '⭐ 어려운 단어' : '☆ 어려운 단어로'; break; }
    case 'prev': cardMove(-1); break;
    case 'next': cardMove(1); break;
    case 'pool': S.set.pool = t.dataset.k; save(); vPractice(); break;
    case 'qsay': TTS.speak(t.dataset.t, !!t.dataset.slow, t); break;
    case 'ans': {
      if (Q.answered) return; Q.answered = true;
      const q = Q.qs[Q.i]; const o = q.opts[+t.dataset.i];
      const ok = q.type === 'readko' ? o.ek === q.w.ek : o.hz === q.w.hz;
      $$('.opt[data-act="ans"]').forEach((b, i) => { b.disabled = true; const oo = q.opts[i]; if (q.type === 'readko' ? oo.ek === q.w.ek : oo.hz === q.w.hz) b.classList.add('ok'); });
      if (!ok) t.classList.add('no');
      if (q.type === 'blank') { $('#blank').textContent = q.w.hz; TTS.speak(q.w.ez); }
      else if (q.type === 'listen' && ok) TTS.speak(q.w.hz);
      mark(ok, q.w);
      $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><b>${ok ? '정답이에요! ⭕' : '아쉬워요 ❌'}</b>${explainWord(q.w)}</div>${nextBtn()}`;
      break;
    }
    case 'mL': case 'mR': {
      const q = Q.qs[Q.i];
      if (t.classList.contains('gone')) return;
      if (act === 'mL') { $$('.opt[data-act="mL"]').forEach(b => b.classList.remove('sel')); t.classList.add('sel'); q.sel = n; TTS.speak(BYN.get(n).hz); return; }
      if (q.sel == null) { toast('왼쪽 중국어를 먼저 골라 주세요'); return; }
      const L = $(`.opt[data-act="mL"][data-n="${q.sel}"]`);
      if (BYN.get(n).k === BYN.get(q.sel).k) {
        L.classList.add('gone'); t.classList.add('gone'); q.left--; q.sel = null;
        if (!q.left) { const ok = q.miss <= 1; if (ok) Q.c++; else Q.wrong.push(...q.set); Q.answered = true; $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><b>${ok ? '모두 짝지었어요! ⭕' : `다 맞췄어요 · 실수 ${q.miss}번`}</b><div class="small mt8">${q.set.map(w => `${esc(w.hz)} ${esc(w.p)} = ${esc(w.k)}`).join('<br>')}</div></div>${nextBtn()}`; }
      } else {
        q.miss++; $('#miss').textContent = q.miss; t.classList.add('shake'); L.classList.add('shake');
        setTimeout(() => { t.classList.remove('shake'); L.classList.remove('shake'); }, 400);
      }
      break;
    }
    case 'showko': { $('#koh').hidden = false; t.remove(); break; }
    case 'hint': { const q = Q.qs[Q.i]; $('#hint').textContent = q.w.p; break; }
    case 'wcheck': {
      if (Q.answered) return;
      const q = Q.qs[Q.i]; const v = $('#winp').value.trim().replace(/\s/g, '');
      if (!v) { toast('답을 입력해 주세요'); return; }
      Q.answered = true;
      const forms = q.w.w.split(/[/／]/).map(s => s.trim());
      const ok = forms.includes(v);
      const pyOk = !ok && /[a-z]/i.test(v) && q.w.pts.includes(toneless(v));
      mark(ok, q.w);
      $('#winp').disabled = true;
      $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><b>${ok ? '정답이에요! ⭕' : pyOk ? '병음은 맞았어요! 한자로도 써 봐요 ✍️' : '아쉬워요 ❌'}</b>${explainWord(q.w)}</div>${nextBtn()}`;
      break;
    }
    case 'blk': {
      if (Q.answered) return;
      const q = Q.qs[Q.i]; const j = +t.dataset.j; q.built.push(j); t.classList.add('used');
      $('#ans').insertAdjacentHTML('beforeend', `<button class="blk" data-act="unblk" data-j="${j}">${esc(q.shuf[j].t)}</button>`);
      break;
    }
    case 'unblk': {
      if (Q.answered) return;
      const q = Q.qs[Q.i]; const j = +t.dataset.j; q.built = q.built.filter(x => x !== j); t.remove();
      $(`#blocks .blk[data-j="${j}"]`).classList.remove('used');
      break;
    }
    case 'bclear': { if (Q.answered) return; const q = Q.qs[Q.i]; q.built = []; $('#ans').innerHTML = ''; $$('#blocks .blk').forEach(b => b.classList.remove('used')); $('#ans').className = 'answer'; break; }
    case 'bcheck': {
      if (Q.answered) return;
      const q = Q.qs[Q.i];
      if (q.built.length < q.shuf.length) { toast('블록을 모두 놓아 주세요'); return; }
      const s = q.built.map(j => q.shuf[j].t).join('');
      const ok = s === q.toks.join('');
      $('#ans').className = 'answer ' + (ok ? 'ok' : 'no');
      if (!ok) {
        q.tries = (q.tries || 0) + 1;
        if (q.tries < 2) { toast('순서가 달라요. 한 번 더 해 봐요!'); $('#ans').classList.add('shake'); return; }
      }
      Q.answered = true;
      if (Q.kind === 'grammar') gMark(ok && !q.tries, q.g); else mark(ok && !q.tries, q.w);
      TTS.speak(q.z);
      $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><b>${ok ? (q.tries ? '맞았어요! (두 번째 시도) ⭕' : '정답이에요! ⭕') : '정답을 확인해 보세요'}</b>
        <div class="zh mt8" style="font-size:20px">${esc(q.z)}</div><div class="small muted">${esc(q.p || '')}</div><div class="small">${esc(q.k)}</div>
        ${q.why ? `<div class="small mt8">💡 ${esc(q.why)}</div>` : ''}
        ${q.gc ? `<div class="small mt8">📘 <b>${esc(GBYID.get(q.gc.g).ko)}</b> — ${esc(q.gc.c)}</div>` : ''}
        <div class="audio-row" style="justify-content:flex-start"><button class="abtn" data-act="qsay" data-t="${esc(q.z)}">🔊 듣기</button><button class="abtn slow" data-act="qsay" data-t="${esc(q.z)}" data-slow="1">🐢 느리게</button></div></div>${nextBtn()}`;
      break;
    }
    case 'gans': {
      if (Q.answered) return; Q.answered = true;
      const q = Q.qs[Q.i]; const j = +t.dataset.j;
      let ok, ri;
      if (q.type === 'gblank') { ri = q.opts.indexOf(q.k); ok = j === ri; if (ok || true) $('#blank').textContent = q.k; }
      else if (q.type === 'gpick') { ri = q.opts.indexOf(q.e.z); ok = j === ri; }
      else { ri = q.opts.indexOf(q.e); ok = j === ri; }
      $$('.opt[data-act="gans"]').forEach((b, i) => { b.disabled = true; if (i === ri) b.classList.add('ok'); });
      if (!ok) t.classList.add('no');
      gMark(ok, q.g);
      TTS.speak(q.e.z);
      $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><b>${ok ? '정답이에요! ⭕' : '아쉬워요 ❌'}</b>${gExplain(q)}</div>${nextBtn()}`;
      break;
    }
    case 'qnext': Q.i++; TTS.stop(); window.scrollTo(0, 0); Q.kind === 'grammar' ? renderGQ() : renderQ(); break;
    case 'qagain': Q.kind === 'grammar' ? vGQuiz(Q.which) : vQuiz(Q.type, S.set.pool || 'today'); break;
    case 'df': { const k = t.dataset.k; let v = t.dataset.v; if (k === 'lv') v = +v; DQ[k] = DQ[k] === v ? (k === 'lv' ? 0 : 'all') : v; if (k === 'lv' && DQ.lv) DQ.src = 'all'; DQ.limit = 80; vDict(); break; }
    case 'dhard': DQ.hard = !DQ.hard; DQ.limit = 80; vDict(); break;
    case 'dmore': DQ.limit += 120; renderDict(); break;
    case 'gf': S.set.gf = t.dataset.v; save(); vGrammarList(); break;
    case 'gsay': { const g = GBYID.get(+location.hash.split('/')[1]); TTS.speak(g.ex[+t.dataset.i].z, !!t.dataset.slow, t); break; }
    case 'gstar': { const s = gst(curN); s.h = s.h ? 0 : 1; save(); t.classList.toggle('on', !!s.h); toast(s.h ? '⭐ 어려운 문법에 추가했어요' : '어려운 문법에서 뺐어요'); break; }
    case 'glearn': { const s = gst(curN); s.l = s.l ? 0 : 1; save(); vGrammar(curN); toast(s.l ? '배운 문법으로 체크했어요' : '체크를 풀었어요'); break; }
    case 'mean': S.set.mean = t.dataset.v; save(); vHard(); break;
    case 'reveal': { const box = t.nextElementSibling; box.hidden = false; t.remove(); TTS.speak(BYN.get(n).hz); break; }
    case 'unhard': { delete S.hard[n]; save(); const el = $('#h' + n); el.style.transition = '.25s'; el.style.opacity = 0; setTimeout(vHard, 250); toast('어려운 단어에서 뺐어요 ✓'); break; }
    case 'hardquiz': S.set.pool = 'hard'; save(); nav('practice'); break;
    case 'play1': TTS.speak(BYN.get(n).hz, false, t); break;
    case 'rv-show': $('#rvans').hidden = false; t.remove(); TTS.speak(BYN.get(+$('[data-act="play1"]').dataset.n).hz); break;
    case 'rv': { const r = S.r[n]; if (t.dataset.ok === '1') { r.st++; r.due = addDays(today(), [1, 3, 7][Math.min(r.st, 2)]); } else { r.st = 0; r.due = addDays(today(), 1); } save(); vReview(); break; }
    case 'sw': { const k = t.dataset.k; S.set[k] = !S.set[k]; save(); t.classList.toggle('on', S.set[k]); break; }
    case 'ttstest': TTS.speak('你好！我们一起学习中文吧。', false, t); break;
    case 'export': doExport(); break;
    case 'copy': doCopy(); break;
    case 'importf': $('#ifile').click(); break;
    case 'importt': sheet(`<h3>백업 내용을 붙여넣으세요</h3><textarea class="code" id="itxt" placeholder='{"app":"pixie-chinese-studio",...}'></textarea><div class="row2 mt8"><button class="btn sec" data-act="closesheet">취소</button><button class="btn" data-act="doimport">가져오기</button></div>`); break;
    case 'doimport': doImport($('#itxt').value); break;
    case 'closesheet': closeSheet(); break;
    case 'reset': if (confirm('정말 모든 학습 기록을 지울까요? 되돌릴 수 없어요.')) { const keep = S.start; S = DEF(); S.start = keep; saveNow(); toast('초기화했어요'); nav('home'); } break;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'winp') { const b = $('[data-act="wcheck"]'); b && b.click(); } });

/* ---------- boot ---------- */
async function boot() {
  load(); applyTheme(); TTS.init();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) nav(b.dataset.tab); });
  try {
    const r = await fetch('data.json?v=2026-11-22c');
    D = await r.json();
  } catch (e) {
    view(`<div class="empty"><div class="e">📡</div>단어장을 불러오지 못했어요.<br>인터넷 연결을 확인하고 다시 열어 주세요.</div>`); return;
  }
  prep();
  if (!localStorage.getItem(KEY)) saveNow();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
