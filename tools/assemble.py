import json, re, sys
sys.path.insert(0, '/home/claude/pcs')
import build_data as bd
from grammar_ko import G

B = '/home/claude/pcs/'
parsed = json.load(open(B + 'grammar_parsed.json'))
FIXEX = {17: [('这道菜看起来很好吃。', 'Zhè dào cài kànqǐlái hěn hǎochī.'), ('他看上去有点儿累。', 'Tā kànshàngqu yǒudiǎnr lèi.')],
         28: [('小猫一会儿跑到门口，一会儿跳到椅子上。', 'Xiǎomāo yíhuìr pǎo dào ménkǒu, yíhuìr tiào dào yǐzi shang.')]}
gram = []
for g in parsed:
    n = g['n']
    k = G[n]
    exs = FIXEX.get(n, g['ex'])
    assert len(exs) == len(k['exk']), (n, len(exs), len(k['exk']))
    examples = [dict(z=z, p=p, k=kk, src='pdf') for (z, p), kk in zip(exs, k['exk'])]
    for z, kk in k['ex']:
        examples.append(dict(z=z, p=bd.sentence_pinyin(z), k=kk, src='add'))
    # check that a key marker appears in at least one example
    keys = [m for m in k['key'] if any(m in e['z'] for e in examples)]
    if not keys:
        print('no key in examples', n, k['key'])
    zh_title = re.sub(r'[“”]', '', g['title'])
    expl = [x for x in g['expl'] if not re.match(r'^[A-Za-zĀ-ž]', x)]
    gram.append(dict(id=n, zh=g['title'], ko=k['ko'], struct=g['struct'], sk=k['sk'], mean=k['mean'],
                     warn=k['warn'], zhExpl=expl, ex=examples,
                     wrong=dict(x=k['wrong'][0], o=k['wrong'][1], why=k['wrong'][2],
                                op=bd.sentence_pinyin(k['wrong'][1])),
                     keys=keys or k['key'], pat=k['pat']))

words = json.load(open(B + 'words_final.json'))
manual = {'快乐': '단어 분석기가 很快/乐로 잘못 나눔. 문장은 정상', '安全': '단어 분석기가 不安/全으로 잘못 나눔. 不+安全, 정상', '不用': '不用谢는 고정 표현(不用+谢)'}
links = 0
for w in words:
    w['g'] = []
    for g in gram:
        try:
            if re.search(g['pat'], w['ez']):
                w['g'].append(g['id'])
        except re.error as e:
            print('regex', g['id'], e)
    links += bool(w['g'])
    if w['src'] == 'new' and w['w'] in manual:
        w['rv'] = manual[w['w']]
    # tokens of the example for "used words" chips
    w['et'] = [t for t in bd.fmm(w['ez'], re.split('[/／]', w['w'])[0].strip()) if re.search(r'[㐀-鿿]', t)]

# grammar example sentences for new words
import glob as _g
GEX = {}
TIP_PREFIX = ('시간의 길이', '정도보어', '……的时候', '……时', '送给', '借给', '也:', '过:', '过 + 횟수', '可能', '형용사 + 点儿', '多 + 동사 + 一点儿', '방향보어 出来: 동사 뒤에 붙어 \'안에서', '방향보어 进来', '방향보어 上去', '방향보어 下来', '방향보어 过去', '결과보어 见')
for f in sorted(_g.glob(B + 'gbatches/g0*.tsv')) + [B + 'gbatches/g10_override.tsv']:
    for l in open(f):
        if not l.strip():
            continue
        p = l.rstrip('\n').split('\t')
        while len(p) < 5:
            p.append('')
        n, zh, ko, gid, cm = int(p[0]), p[1], p[2], int(p[3] or 0), p[4].strip()
        if gid and cm.startswith(TIP_PREFIX):
            gid = 0
        if cm.startswith('결과보어 见'):
            gid = 58
        GEX[n] = dict(z=zh, k=ko, g=gid, c=cm)
assert len(GEX) == 730, len(GEX)
SPLIT = {1022: '放了三天假', 1084: '结了婚', 1097: '开完会', 1113: '离不开', 1162: '听不清楚', 1280: '照了很多相'}
SEGOK = {674, 705, 752, 1133, 1184, 1299}
for w in words:
    if w['src'] == 'new':
        e = GEX[w['n']]
        w['ez'], w['ek'] = e['z'], e['k']
        w['ep'] = bd.sentence_pinyin(e['z'], w['w'], w['p'])
        w['gc'] = dict(g=e['g'], c=e['c']) if e['c'] else None
        w.pop('orig', None)
        w['g'] = [e['g']] if e['g'] else []
        if w['n'] in SPLIT:
            w['rv'] = f"이합사·보어 형태라 단어가 떨어져서 쓰였어요({SPLIT[w['n']]}). 사람이 확인한 정상 문장이에요."
        elif w['n'] in SEGOK:
            w['rv'] = '단어 분석기가 문장을 잘못 나눠서 표시된 문장이에요. 사람이 확인한 정상 문장이에요.'
        else:
            w.pop('rv', None)

for w in words:
    w['et'] = [t for t in bd.fmm(w['ez'], re.split('[/／]', w['w'])[0].strip()) if re.search(r'[\u3400-\u9fff]', t)]

# compact keys for app
out = []
for w in words:
    d = dict(n=w['n'], w=w['w'], p=w['p'], k=w['k'], ez=w['ez'], ep=w['ep'], ek=w['ek'], s=w['src'])
    if w['src'] == 'new':
        d['lv'] = w['lv']; d['d'] = w['day']
    w0 = re.split('[/／]', w['w'])[0].strip(); p0 = re.split('[/／]', w['p'])[0].strip() if w['p'] else ''
    if re.fullmatch(r'[\u3400-\u9fff]+', w0) and p0:
        sy = bd.syls_of(w0, p0)
        if len(sy) == len(w0):
            d['sy'] = sy
    for key in ('orig', 'dupOf', 'notes', 'g', 'rv', 'et', 'gc'):
        if w.get(key):
            d[key] = w[key]
    out.append(d)
for g in gram:
    for e in g['ex']:
        e['t'] = [t for t in bd.fmm(e['z']) if re.search(r'[\u3400-\u9fff]', t)]
    g['wrong']['t'] = [t for t in bd.fmm(g['wrong']['o']) if re.search(r'[\u3400-\u9fff]', t)]
report = json.load(open(B + 'report.json'))
report['exceptions'] = sorted(json.load(open(B + 'exceptions.json')))
report['knownFromOldEx'] = sorted(json.load(open(B + 'known_from_old_ex.json')))
json.dump(dict(words=out, grammar=gram, report=report, version='2026-11-22'),
          open(B + 'app/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('words', len(out), 'grammar', len(gram), 'words with grammar link', links)
