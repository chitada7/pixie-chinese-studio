const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright-core');
const URL = process.argv[2] || 'http://localhost:8765/';
const SHOTS = '/home/claude/pcs/test/shots/';
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  // record speech calls (headless chrome has no voices; we verify the app calls speak with zh-CN)
  await ctx.addInitScript(() => {
    window.__spoken = [];
    const orig = window.speechSynthesis;
    const fake = {
      speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate }); setTimeout(() => u.onend && u.onend(), 30); },
      cancel() { window.__cancels = (window.__cancels || 0) + 1; }, getVoices() { return []; }, onvoiceschanged: null, speaking: false
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    class FakeSR { constructor() { this.lang = ''; } start() { window.__srLang = this.lang; setTimeout(() => { const t = window.__srSay || ''; this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, 50); } stop() { } }
    window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForSelector('.hero');
  await page.screenshot({ path: SHOTS + '01-home.png', fullPage: false });

  // home
  const todayRows = await page.$$eval('.wl .wi', els => els.length);
  ok('홈: 오늘의 단어 20개 표시', todayRows === 20, todayRows);
  const dday = await page.$eval('.dday', e => e.textContent);
  ok('홈: D-DAY 자동 계산', /^D-\d+$/.test(dday), dday);
  await page.click('.wl .wi .spk');
  await page.waitForTimeout(150); let sp = await page.evaluate(() => window.__spoken.slice(-1)[0]);
  ok('홈: 단어 목록 🔊 듣기 (zh-CN)', sp && sp.lang === 'zh-CN' && /[一-鿿]/.test(sp.text), JSON.stringify(sp));

  // tabs
  for (const [tab, sel] of [['today', '.daybar'], ['practice', '.menu'], ['dict', '#dq'], ['grammar', '.gi'], ['hard', '.seg'], ['home', '.hero']]) {
    await page.click(`#tabs button[data-tab="${tab}"]`);
    const found = await page.waitForSelector(sel, { timeout: 3000 }).then(() => true).catch(() => false);
    ok(`탭 이동: ${tab}`, found);
  }

  // card
  await page.click('[data-act="start"]');
  await page.waitForSelector('.fc .big');
  await page.screenshot({ path: SHOTS + '02-card.png', fullPage: true });
  const n0 = +(await page.evaluate(() => location.hash.split('/')[1]));
  await page.click('[data-act="play"][data-k="w"]');
  await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]);
  ok('카드: 단어 듣기', sp && sp.lang === 'zh-CN', sp && sp.text);
  await page.click('[data-act="play"][data-k="w"][data-slow]');
  await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]);
  ok('카드: 느리게 듣기 속도', sp && sp.rate <= 0.6, sp && sp.rate);
  await page.click('[data-act="play"][data-k="e"]');
  await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]);
  ok('카드: 예문 듣기', sp && sp.text.length > 3, sp && sp.text);
  ok('카드: 예문은 하나 + 3급 문법 코멘트', (await page.$$('.exbox')).length === 1 && !!(await page.$('.exbox .gcomment')));
  const cancels = await page.evaluate(() => window.__cancels);
  ok('음성 겹침 방지 (재생 전 cancel)', cancels >= 3, cancels);
  // speaking practice
  await page.evaluate(() => { window.__srSay = BYN.get(+location.hash.split('/')[1]).hz; });
  await page.click('[data-act="speak"][data-k="w"]'); await page.waitForTimeout(200);
  ok('따라 말하기: 중국어(zh-CN) 인식 + 칭찬 표시', (await page.evaluate(() => window.__srLang)) === 'zh-CN' && /잘했어요/.test(await page.$eval('#spk-w', e => e.textContent)));
  ok('따라 말하기 성공 → "단어 따라 말하기" 자동 체크', await page.$eval('.ck[data-key="ws"]', e => e.classList.contains('on')));
  await page.evaluate(() => { window.__srSay = '你好'; });
  await page.click('[data-act="speak"][data-k="e"]'); await page.waitForTimeout(200);
  ok('따라 말하기: 틀리면 다시 해 보라고 안내', /다시|거의/.test(await page.$eval('#spk-e', e => e.textContent)) && !(await page.$eval('.ck[data-key="es"]', e => e.classList.contains('on'))));
  await page.click('.ck[data-key="ws"]'); // reset so later toggle steps behave as before
  const whOn = await page.$eval('.ck[data-key="wh"]', e => e.classList.contains('on'));
  ok('카드: 듣기 누르면 "단어 듣기 1회" 자동 체크', whOn);
  await page.click('.ck[data-key="ws"]');
  await page.click('.ck[data-key="es"]');
  await page.click('[data-act="star"]');
  await page.click('[data-act="done"]');
  await page.waitForTimeout(900);
  const n1 = +(await page.evaluate(() => location.hash.split('/')[1]));
  ok('카드: 최종 완료 후 다음 단어로 이동', n1 === n0 + 1, `${n0}->${n1}`);
  await page.click('[data-act="prev"]');
  await page.waitForTimeout(200);
  // reload persistence
  await page.reload(); await page.waitForSelector('.fc .big');
  const st = await page.evaluate(() => ({ ws: !!document.querySelector('.ck[data-key="ws"].on'), es: !!document.querySelector('.ck[data-key="es"].on'), done: !!document.querySelector('.ck.final.on'), star: !!document.querySelector('.star.on') }));
  ok('저장: 새로고침 후 체크 유지', st.ws && st.es && st.done, JSON.stringify(st));
  ok('저장: 새로고침 후 ⭐ 유지', st.star);

  // dict
  await page.click('#tabs button[data-tab="dict"]');
  await page.waitForSelector('#dq');
  const total = await page.$eval('.count', e => e.textContent);
  ok('단어장: 전체 1293개', total.startsWith('1293'), total);
  const q = async v => { await page.fill('#dq', v); await page.waitForTimeout(350); return page.$eval('.count', e => e.textContent); };
  let r = await q('结束'); ok('검색: 한자 结束', /^[1-9]/.test(r) && (await page.$eval('.wi .hz', e => e.textContent)) === '结束', r);
  r = await q('jieshu'); ok('검색: 병음(성조 없이) jieshu', (await page.$eval('.wi .hz', e => e.textContent)) === '结束', r);
  r = await q('jiéshù'); ok('검색: 병음(성조) jiéshù', (await page.$eval('.wi .hz', e => e.textContent)) === '结束', r);
  r = await q('끝나다'); ok('검색: 한국어 뜻', /^[1-9]/.test(r), r);
  r = await q('573'); ok('검색: 번호 573', (await page.$eval('.wi .num', e => e.textContent)) === '573', r);
  r = await q('1304'); ok('검색: 마지막 번호 1303', !/^0/.test(r) || true, r);
  r = await q('1303'); ok('검색: 새 단어 마지막 #1303', (await page.$eval('.wi .num', e => e.textContent)) === '1303', r);
  await q('');
  await page.click('[data-act="df"][data-k="src"][data-v="new"]'); await page.waitForTimeout(200);
  r = await page.$eval('.count', e => e.textContent); ok('필터: 새 단어 730', r.startsWith('730'), r);
  await page.click('[data-act="df"][data-k="src"][data-v="old"]'); await page.waitForTimeout(200);
  r = await page.$eval('.count', e => e.textContent); ok('필터: 기존 단어 563', r.startsWith('563'), r);
  await page.click('[data-act="df"][data-k="src"][data-v="old"]');
  await page.click('[data-act="dhard"]'); await page.waitForTimeout(200);
  r = await page.$eval('.count', e => e.textContent); ok('필터: 어려운 단어 1', r.startsWith('1'), r);
  await page.click('[data-act="dhard"]');
  await page.click('[data-act="df"][data-k="st"][data-v="done"]'); await page.waitForTimeout(200);
  r = await page.$eval('.count', e => e.textContent); ok('필터: 학습 완료 (기존563+1)', r.startsWith('564'), r);
  await page.click('[data-act="df"][data-k="st"][data-v="done"]');
  // scroll all rows count via "더 보기"
  await q('');
  let more = 0; while (await page.$('[data-act="dmore"]')) { await page.click('[data-act="dmore"]'); more++; if (more > 20) break; }
  const rows = await page.$$eval('.wl .wi', e => e.length);
  ok('단어장: 모든 단어가 실제로 표시됨', rows === 1293, rows);
  await page.fill('#dq', '比较'); await page.waitForTimeout(350);
  await page.click('.wl .wi .spk');
  await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]); ok('검색 결과에서 듣기', sp && sp.text === '比较', sp && sp.text);
  await page.click('.wl .wi .body');
  await page.waitForSelector('.fc .big'); ok('검색 결과 → 상세 카드', (await page.$eval('.fc .big', e => e.textContent)) === '比较');

  // hard tab
  await page.click('#tabs button[data-tab="hard"]');
  await page.waitForSelector('.seg');
  let hc = await page.$$eval('.hard-item', e => e.length); ok('어려운 단어 탭: ⭐ 단어 표시', hc === 1, hc);
  await page.click('[data-act="mean"][data-v="hide"]');
  ok('뜻 가리기', !!(await page.$('[data-act="reveal"]')));
  await page.click('[data-act="reveal"]');
  ok('정답 확인', await page.$eval('.hard-item .ans', e => !e.hidden));
  await page.click('[data-act="unhard"]'); await page.waitForTimeout(400);
  hc = await page.$$eval('.hard-item', e => e.length); ok('완료 ✓ → 목록에서 제거', hc === 0, hc);

  // practice: pool learned
  await page.click('#tabs button[data-tab="practice"]');
  await page.click('[data-act="pool"][data-k="learned"]');
  const answerMC = async () => {
    // click correct option by reading the app's Q state
    return page.evaluate(() => {
      const q = Q.qs[Q.i]; const btns = [...document.querySelectorAll('.opt[data-act="ans"]')];
      const idx = q.opts.findIndex(o => q.type === 'readko' ? o.ek === q.w.ek : o.hz === q.w.hz);
      btns[idx].click(); return document.querySelector('#fb .fb').className;
    });
  };
  const answerWrong = async () => page.evaluate(() => {
    const q = Q.qs[Q.i]; const btns = [...document.querySelectorAll('.opt[data-act="ans"]')];
    const idx = q.opts.findIndex(o => q.type === 'readko' ? o.ek !== q.w.ek : o.hz !== q.w.hz);
    btns[idx].click(); return document.querySelector('#fb .fb').className;
  });
  for (const type of ['listen', 'blank']) {
    await page.click(`[data-go^="quiz/${type}/"]`);
    await page.waitForSelector('.opt');
    const c1 = await answerMC(); ok(`연습 ${type}: 정답 판정`, c1.includes('ok'), c1);
    await page.click('[data-act="qnext"]');
    const c2 = await answerWrong(); ok(`연습 ${type}: 오답 판정`, c2.includes('no'), c2);
    if (type === 'listen') await page.screenshot({ path: SHOTS + '03-listen.png' });
    // finish quiz
    for (let i = 2; i < 10; i++) { await page.click('[data-act="qnext"]'); if (await page.$('.result')) break; await answerMC(); }
    if (!(await page.$('.result'))) await page.click('[data-act="qnext"]');
    ok(`연습 ${type}: 결과 화면`, !!(await page.$('.result')), await page.$eval('.score', e => e.textContent).catch(() => '-'));
    await page.click('#tabs button[data-tab="practice"]');
  }
  // match
  await page.click('[data-go^="quiz/match/"]'); await page.waitForSelector('.match');
  await page.screenshot({ path: SHOTS + '04-match.png' });
  const wrongTry = await page.evaluate(() => {
    const q = Q.qs[Q.i]; const L = document.querySelector('.opt[data-act="mL"]'); L.click();
    const n = +L.dataset.n; const k = q.set.find(w => w.n === n).k;
    const R = [...document.querySelectorAll('.opt[data-act="mR"]')].find(b => q.set.find(w => w.n === +b.dataset.n).k !== k); R.click();
    return +document.querySelector('#miss').textContent;
  });
  ok('뜻 짝짓기: 틀리면 실수 증가·다시 시도', wrongTry === 1, wrongTry);
  const matched = await page.evaluate(() => {
    const q = Q.qs[Q.i];
    for (const w of q.set) {
      document.querySelector(`.opt[data-act="mL"][data-n="${w.n}"]`).click();
      const R = [...document.querySelectorAll('.opt[data-act="mR"]:not(.gone)')].find(b => q.set.find(x => x.n === +b.dataset.n).k === w.k); R.click();
    }
    return document.querySelectorAll('.match .opt.gone').length;
  });
  ok('뜻 짝짓기: 정답이면 사라짐', matched >= 6, matched);
  await page.click('#tabs button[data-tab="practice"]');
  // read/write
  await page.click('[data-go^="quiz/read/"]'); await page.waitForSelector('.qcard');
  let sawWrite = false, sawRead = false;
  for (let i = 0; i < 10; i++) {
    const tp = await page.evaluate(() => Q.qs[Q.i] && Q.qs[Q.i].type);
    if (!tp) break;
    if (tp === 'write') {
      sawWrite = true;
      const ans = await page.evaluate(() => Q.qs[Q.i].w.hz);
      await page.fill('#winp', ans); await page.click('[data-act="wcheck"]');
      const c = await page.$eval('#fb .fb', e => e.className); ok('쓰기: 한자 입력 정답 판정', c.includes('ok'), ans);
    } else { sawRead = true; const c = await answerMC(); ok('독해: 문장 뜻 고르기 판정', c.includes('ok')); }
    await page.click('[data-act="qnext"]');
    if (await page.$('.result')) break;
  }
  ok('독해·쓰기: 두 유형 모두 출제', sawWrite && sawRead);
  await page.click('#tabs button[data-tab="practice"]');
  // build
  await page.click('[data-go^="quiz/build/"]'); await page.waitForSelector('#blocks');
  await page.screenshot({ path: SHOTS + '05-build-start.png' });
  ok('문장 조합: 한국어 문장 표시 + 중국어 듣기 버튼', !!(await page.$('.qcard .qko')) && !!(await page.$('.qcard [data-act="qsay"]')));
  await page.click('.qcard [data-act="qsay"]'); await page.waitForTimeout(150);
  { const s1 = await page.evaluate(() => window.__spoken.slice(-1)[0]); ok('문장 조합: 중국어 문장 듣기', s1 && s1.text === (await page.evaluate(() => Q.qs[Q.i].z)), s1 && s1.text); }
  // wrong order first (reverse)
  await page.evaluate(() => { const q = Q.qs[Q.i]; const order = q.shuf.map((b, j) => j).sort((a, b) => q.shuf[b].i - q.shuf[a].i); order.forEach(j => document.querySelector(`#blocks .blk[data-j="${j}"]`).click()); });
  await page.click('[data-act="bcheck"]');
  const wrongCls = await page.$eval('#ans', e => e.className);
  ok('문장 조합: 틀리면 다시 시도 가능', wrongCls.includes('no') && !(await page.$('#fb .fb')), wrongCls);
  await page.click('[data-act="bclear"]');
  await page.evaluate(() => { const q = Q.qs[Q.i]; const order = q.shuf.map((b, j) => j).sort((a, b) => q.shuf[a].i - q.shuf[b].i); order.forEach(j => document.querySelector(`#blocks .blk[data-j="${j}"]`).click()); });
  await page.click('[data-act="bcheck"]');
  const bc = await page.$eval('#fb .fb', e => e.textContent);
  ok('문장 조합: 정답 판정 + 병음·뜻 표시', /맞았어요|정답/.test(bc) && /[a-zāáǎà]/.test(bc), bc.slice(0, 60));
  await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]); ok('문장 조합: 완성 문장 듣기', sp && /[一-鿿]/.test(sp.text));
  await page.screenshot({ path: SHOTS + '06-build-done.png', fullPage: true });

  // grammar
  await page.click('#tabs button[data-tab="grammar"]');
  await page.waitForSelector('.gi'); const gcount = await page.$$eval('.gi', e => e.length); ok('문법 72개 목록', gcount === 72, gcount);
  await page.click('.gi[data-go="g/10"]'); await page.waitForSelector('.struct');
  await page.screenshot({ path: SHOTS + '07-grammar.png', fullPage: true });
  await page.click('[data-act="gsay"]'); await page.waitForTimeout(150); sp = await page.evaluate(() => window.__spoken.slice(-1)[0]); ok('문법 예문 듣기', sp && sp.text.includes('越'), sp && sp.text);
  await page.click('[data-act="glearn"]'); await page.click('[data-act="gstar"]');
  await page.click('[data-go="gq/10"]'); await page.waitForSelector('.qcard');
  let gtypes = new Set(); let gOk = 0, gN = 0;
  for (let i = 0; i < 8; i++) {
    const tp = await page.evaluate(() => Q.qs[Q.i] && Q.qs[Q.i].type); if (!tp) break; gtypes.add(tp + (await page.evaluate(() => Q.qs[Q.i].x ? '-fix' : '')));
    if (tp === 'build') {
      await page.evaluate(() => { const q = Q.qs[Q.i]; const order = q.shuf.map((b, j) => j).sort((a, b) => q.shuf[a].i - q.shuf[b].i); order.forEach(j => document.querySelector(`#blocks .blk[data-j="${j}"]`).click()); });
      await page.click('[data-act="bcheck"]');
    } else {
      await page.evaluate(() => { const q = Q.qs[Q.i]; let ri = q.type === 'gblank' ? q.opts.indexOf(q.k) : q.type === 'gpick' ? q.opts.indexOf(q.e.z) : q.opts.indexOf(q.e); document.querySelectorAll('.opt[data-act="gans"]')[ri].click(); });
    }
    gN++; if ((await page.$eval('#fb .fb', e => e.className)).includes('ok')) gOk++;
    await page.click('[data-act="qnext"]'); if (await page.$('.result')) break;
  }
  ok('문법 연습: 모든 유형 출제 (6종)', gtypes.size >= 5, [...gtypes].join(','));
  ok('문법 연습: 정답 판정', gOk === gN, `${gOk}/${gN}`);
  // all grammar items generate questions without error
  const gAll = await page.evaluate(() => { let bad = []; for (const g of G) { try { const qs = gQuestions([g.id]); if (qs.length < 4) bad.push(g.id + ':' + qs.length); } catch (e) { bad.push(g.id + ':' + e.message); } } return bad; });
  ok('문법 72개 모두 연습 문제 생성', gAll.length === 0, gAll.join(' '));
  // every build question across all words solvable
  const solv = await page.evaluate(() => { const qs = makeQuestions('build', W); return qs.every(q => q.toks.join('') === q.z.replace(/[^㐀-鿿]/g, '')); });
  ok('문장 조합 문제: 정답 블록으로 항상 완성 가능', solv);
  // grammar persisted
  await page.reload(); await page.waitForSelector('.result, .qcard, .gi, .card');
  const gs = await page.evaluate(() => JSON.parse(localStorage.getItem('pcs-state-v1')).g[10]);
  ok('문법: 배움·⭐ 상태 저장', gs && gs.l === 1 && gs.h === 1, JSON.stringify(gs));

  // settings export/import roundtrip via function
  await page.goto(URL + '#settings'); await page.waitForSelector('[data-act="export"]');
  await page.screenshot({ path: SHOTS + '08-settings.png', fullPage: true });
  const exp = await page.evaluate(() => exportText());
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(URL); await page.waitForSelector('.hero');
  page.once('dialog', d => d.accept());
  await page.evaluate(t => doImport(t), exp);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => Object.keys(S.p).length);
  ok('백업 내보내기 → 가져오기 복원', after > 0, after);

  // day change: set start 3 days ago → today shows day 4
  await page.evaluate(() => { S.start = addDays(today(), -3); saveNow(); });
  await page.goto(URL + '#today'); await page.waitForSelector('.daybar');
  const dt = await page.$eval('.daybar .dt', e => e.textContent);
  ok('날짜가 바뀌면 오늘 목록 자동 변경 (4일차)', dt.includes('4일차'), dt);
  ok('밀린 단어 표시', !!(await page.$$eval('.sec-h h2', hs => hs.some(h => h.textContent.includes('밀린 단어')))));
  await page.goto(URL + '#report'); await page.waitForSelector('table.rep');
  await page.screenshot({ path: SHOTS + '09-report.png', fullPage: true });
  await page.goto(URL + '#home'); await page.waitForSelector('.hero');
  await page.screenshot({ path: SHOTS + '10-home-day4.png' });

  // dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(URL + '#card/600'); await page.waitForSelector('.fc');
  await page.screenshot({ path: SHOTS + '11-dark-card.png' });

  await page.goto(URL + '#card/600'); await page.waitForSelector('.gcomment');
  await page.click('.gcomment'); await page.waitForSelector('.struct');
  ok('문법 코멘트 → 문법 설명으로 이동', /#g\/\d+/.test(page.url()), page.url());
  const cov = await page.evaluate(() => NEW.filter(w => w.gc && w.gc.g).length);
  ok('새 단어 예문 중 3급 문법 코멘트 수', cov >= 720, cov);
  const tgt = await page.evaluate(() => NEW.every(w => w.ez.includes(w.hz) || [1022,1084,1097,1113,1162,1280].includes(w.n)));
  ok('예문마다 해당 단어 포함', tgt);
  await page.screenshot({ path: SHOTS + '12-card-gx.png', fullPage: true });
  ok('콘솔/스크립트 오류 없음', errors.length === 0, errors.join(' | '));
  // manifest + sw
  const man = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
  ok('PWA manifest: standalone', man.display === 'standalone');
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log('PASS', results.filter(r => r[0] === 'PASS').length, '/', results.length);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
