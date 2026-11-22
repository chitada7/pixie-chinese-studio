import json, re, unicodedata, warnings, collections
warnings.filterwarnings('ignore')
import jieba
from pypinyin import pinyin, Style
jieba.setLogLevel(60)
B = '/home/claude/pcs/'

old = json.load(open(B + 'old.json'))
hsk = json.load(open(B + 'hsk.json'))
neworder = json.load(open(B + 'new_order.json'))  # original numbering 574.. (731)

# ---------- old list: headword fixes ----------
HEAD_FIX = {
    26: dict(w='长城', p='Chángchéng', note='단어가 故宫으로 중복 입력되어 있었으나 뜻·예문이 만리장성이라 长城으로 수정'),
    101: dict(p='gōngjiāochē / bāshì', note='병음 보완'),
    102: dict(p='chēzhàn / zhàntái', note='병음 보완'),
    130: dict(p='míngtiān', note='병음 오타 수정 (míntiān → míngtiān)'),
    189: dict(p='xīngqīrì / xīngqītiān', note='병음 보완'),
    255: dict(w='旁边', p='pángbiān', k='옆', note='단어 칸에 한글(옆에)이 입력되어 있어 旁边으로 수정'),
    428: dict(p='wèn fùjìn de rén', note='병음 누락 보완'),
}
ex_fix = {}
for l in open(B + 'old_fix.tsv'):
    if l.strip():
        n, z, k = l.rstrip('\n').split('\t')
        ex_fix[int(n)] = (z, k)

olds = []
for o in old:
    e = dict(n=o['n'], w=o['w'], p=o['p'], k=o['k'], ez=o['ez'], ek=o['ek'], src='old', notes=[])
    if o['n'] in HEAD_FIX:
        f = HEAD_FIX[o['n']]
        for key in ('w', 'p', 'k'):
            if key in f:
                e[key] = f[key]
        e['notes'].append(f['note'])
    if o['n'] in ex_fix:
        z, k = ex_fix[o['n']]
        if z != o['ez']:
            e['orig'] = o['ez']
            e['notes'].append('예문 수정 (원문 보관)')
        if not o['ek']:
            e['notes'].append('예문 해석 추가')
        e['ez'], e['ek'] = z, k
    olds.append(e)

# duplicate groups inside old list
grp = collections.defaultdict(list)
for e in olds:
    for w in re.split('[/／]', e['w']):
        grp[w.strip()].append(e['n'])
for e in olds:
    others = sorted({m for w in re.split('[/／]', e['w']) for m in grp[w.strip()] if m != e['n']})
    if others:
        e['dupOf'] = others

oldw = {w.strip() for e in olds for w in re.split('[/／]', e['w'])}

# ---------- new list ----------
rows = {}
import glob
for f in sorted(glob.glob(B + 'batches/b0*.tsv')):
    for l in open(f):
        if l.strip():
            n, ko, z, zk = l.rstrip('\n').split('\t')
            rows[int(n)] = (ko, z, zk)
assert len(rows) == 731
news = []
removed = []
for h in neworder:
    if h['w'] in oldw and h['w'] == '旁边':
        removed.append(h)
        continue
    ko, z, zk = rows[h['n']]
    news.append(dict(w=h['w'], p=h['p'], k=ko, ez=z, ek=zk, lv=h['lv'], src='new', origN=h['n']))
for i, e in enumerate(news):
    e['n'] = 574 + i
    e['day'] = i // 20 + 1

# write new_order for the checker with renumbered days
json.dump([dict(n=e['n'], day=e['day'], w=e['w'], p=e['p'], lv=e['lv']) for e in news],
          open(B + 'new_order_final.json', 'w'), ensure_ascii=False)

# ---------- pinyin for sentences ----------
hsk_read = collections.defaultdict(set)
for h in hsk:
    hsk_read[h['w']].add(h['p'].split('/')[0].strip().replace('’', "'"))
old_read = collections.defaultdict(set)
for e in olds:
    ws = [x.strip() for x in re.split('[/／]', e['w'])]
    ps = [x.strip() for x in re.split('[/／]', e['p'])] if e['p'] else []
    if len(ws) == len(ps):
        for w, p in zip(ws, ps):
            if re.fullmatch(r'[㐀-鿿]+', w):
                old_read[w].add(p)
for w in list(hsk_read) + list(old_read):
    jieba.add_word(w, freq=2000)

TONE = {}
for base, marks in {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}.items():
    for t, c in enumerate(marks, 1):
        TONE[c] = (base, t)

def tone_of(s):
    for c in s:
        if c in TONE:
            return TONE[c][1]
    return 5

def set_tone(s, t):
    # change existing tone mark on 'yi'/'bu' style syllables
    out = ''
    for c in s:
        if c in TONE:
            base = TONE[c][0]
            c = {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}[base][t - 1]
        out += c
    return out

def syls_of(word, py):
    """split a word pinyin into syllables aligned with characters (best effort)."""
    py = py.replace("'", ' ').replace('-', ' ')
    auto = [x[0] for x in pinyin(word, style=Style.TONE, heteronym=False)]
    parts = py.split()
    if len(parts) == len(word):
        return parts
    # use pypinyin lengths as a guide to split compact pinyin
    joined = py.replace(' ', '')
    res, pos = [], 0
    for i, a in enumerate(auto):
        base = unicodedata.normalize('NFD', a)
        L = len(''.join(ch for ch in base if unicodedata.category(ch) != 'Mn'))
        # take same number of letters (ignoring tone marks) from joined
        cnt, j = 0, pos
        while j < len(joined) and cnt < L:
            cnt += 1
            j += 1
        res.append(joined[pos:j])
        pos = j
    if pos < len(joined) and res:
        res[-1] += joined[pos:]
    return res

EXTRA = {'北京':'Běijīng','上海':'Shànghǎi','王明':'Wáng Míng','首尔':'Shǒu\'ěr','韩国':'Hánguó','韩国人':'Hánguórén','王':'Wáng','北边':'běibian','南边':'nánbian','东边':'dōngbian','西边':'xībian','火车站':'huǒchēzhàn','北京站':'Běijīng Zhàn','学好':'xuéhǎo','春节':'Chūnjié','中国人':'Zhōngguórén','外面':'wàimiàn','一会儿':'yíhuìr'}
for k,v in EXTRA.items():
    hsk_read[k] = {v}
VOCAB = set(hsk_read) | set(old_read)
def fmm(zh, target=None):
    toks, i = [], 0
    while i < len(zh):
        if not re.match(r'[\u3400-\u9fff]', zh[i]):
            toks.append(zh[i]); i += 1; continue
        for L in range(min(5, len(zh) - i), 0, -1):
            piece = zh[i:i+L]
            if L == 1 or piece in VOCAB or piece == target:
                # prefer the target word when it starts here
                if target and zh.startswith(target, i) and len(target) > L:
                    piece = target; L = len(target)
                toks.append(piece); i += L; break
    # attach 们 to previous token
    out = []
    for t in toks:
        if t == '们' and out and re.search(r'[\u3400-\u9fff]$', out[-1]) and out[-1] not in ('我','你','他','她','它'):
            out[-1] += t
        else:
            out.append(t)
    return out

NUMCH = set('零一二三四五六七八九十百千万两几第')

def sentence_pinyin(zh, target=None, target_p=None):
    out = []
    toks = fmm(zh, target)
    syl = []  # (char, syllable, from_dict)
    for t in toks:
        if not re.search(r'[㐀-鿿]', t):
            syl.append((t, None, True))
            continue
        if target and t == target and target_p:
            p = target_p
        elif len(hsk_read.get(t, ())) == 1:
            p = next(iter(hsk_read[t]))
        elif len(old_read.get(t, ())) == 1:
            p = next(iter(old_read[t]))
        else:
            p = None
        if p:
            ss = syls_of(t, p)
            for ch, s in zip(t, ss):
                syl.append((ch, s, len(t) > 1))
            syl.append(('|', None, True))  # word boundary
        else:
            ps = [x[0] for x in pinyin(t, style=Style.TONE)]
            for ch, s in zip(t, ps):
                syl.append((ch, s, False))
            syl.append(('|', None, True))
    # tone sandhi for 一 and 不 (only for automatically generated syllables)
    chars = [s for s in syl if s[1]]
    for i, (ch, s, fd) in enumerate(chars):
        if fd or ch not in '一不':
            continue
        nxt = chars[i + 1] if i + 1 < len(chars) else None
        prv = chars[i - 1] if i > 0 else None
        if ch == '不' and nxt and tone_of(nxt[1]) == 4:
            chars[i] = (ch, set_tone(s, 2), fd)
        if ch == '一':
            if prv and prv[0] in NUMCH or (nxt and nxt[0] in (NUMCH - set('百千万')) | set('月号日点楼年')):
                continue
            if nxt is None:
                continue
            t = tone_of(nxt[1])
            chars[i] = (ch, set_tone(s, 2 if t == 4 else 4), fd)
    it = iter(chars)
    res = ''
    for ch, s, fd in syl:
        if s:
            c = next(it)
            res += c[1]
        elif ch == '|':
            res += ' '
        else:
            res = res.rstrip() + ch.replace('，', ', ').replace('。', '. ').replace('？', '? ').replace('！', '! ').replace('：', ': ').replace('、', ', ').replace('……', '... ').replace('—', ' — ').replace('“', '"').replace('”', '"')
            if ch not in '，。？！：、……':
                res += ' ' if ch.strip() else ''
    res = re.sub(r'\s+', ' ', res).strip()
    res = re.sub(r'\s+([,.?!:])', r'\1', res)
    # capitalise first letter
    if res:
        res = res[0].upper() + res[1:]
    return res

for e in olds:
    w0 = re.split('[/／]', e['w'])[0].strip()
    p0 = re.split('[/／]', e['p'])[0].strip() if e['p'] else None
    e['ep'] = sentence_pinyin(e['ez'], w0, p0) if re.search(r'[㐀-鿿]', e['ez']) else ''
for e in news:
    e['ep'] = sentence_pinyin(e['ez'], e['w'], e['p'])

words = olds + news
json.dump(words, open(B + 'words_final.json', 'w'), ensure_ascii=False)

# ---------- dedup report ----------
cmp_ = json.load(open(B + 'cmp.json'))
dups = [dict(w=h['w'], p=h['p'], lv=h['lv'], old=n) for h, n in cmp_['dup']]
for h in removed:
    dups.append(dict(w=h['w'], p=h['p'], lv=h['lv'], old=[255]))
report = dict(
    hsk_total=len(hsk), hsk_by_level={1: 300, 2: 200, 3: 500},
    old_count=len(olds), dup_count=len(dups), new_count=len(news), final_count=len(words),
    dups=dups,
    review=[
        dict(w='得', note='HSK의 de(구조조사)·děi(~해야 한다)는 기존 570번 得 dé(얻다)와 뜻이 달라 새 단어로 유지'),
        dict(w='地', note='HSK의 de(부사어 조사)는 기존 144번 地 dì(바닥)와 달라 새 단어로 유지'),
        dict(w='只', note='HSK의 zhǐ(단지)는 기존 96·114번 只 zhī(마리)와 달라 새 단어로 유지'),
        dict(w='还', note='HSK 1급 hái(아직)는 기존 170번과 같아 제외, 3급 huán(돌려주다)은 기존 425번과 같아 제외'),
        dict(w='明天', note='기존 130번 병음 míntiān → míngtiān 오타 수정 후 중복 처리'),
        dict(w='星期天', note='기존 189번 星期日/星期天과 같은 단어로 중복 처리'),
        dict(w='公交车', note='기존 101번 公交车/巴士와 같은 단어로 중복 처리'),
        dict(w='旁边', note='기존 255번 단어 칸이 한글(옆에)이라 旁边으로 수정 → HSK 旁边과 중복 처리'),
        dict(w='谁', note='HSK 병음 shéi/shuí, 기존 401번 shéi — 같은 단어로 중복 처리'),
    ],
    old_internal_dups=sorted({tuple(sorted([e['n']] + e['dupOf'])) for e in olds if e.get('dupOf')}),
)
json.dump(report, open(B + 'report.json', 'w'), ensure_ascii=False, indent=1)
print('old', len(olds), 'new', len(news), 'final', len(words), 'dups', len(dups), 'days', news[-1]['day'])
