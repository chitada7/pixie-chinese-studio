import json, re, sys, glob, warnings
warnings.filterwarnings('ignore')
import jieba
jieba.setLogLevel(60)

old = json.load(open('/home/claude/pcs/old.json'))
new = json.load(open('/home/claude/pcs/new_order_final.json'))
hsk = json.load(open('/home/claude/pcs/hsk.json'))

oldw = set()
for o in old:
    for w in re.split('[/／]', o['w']):
        w = w.strip()
        if re.fullmatch(r'[㐀-鿿]+', w):
            oldw.add(w)
# new words already used in the existing (old) example sentences
KNOWN_FROM_OLD_EX = set(json.load(open('/home/claude/pcs/known_from_old_ex.json')))
# minimal exceptions: names / fixed bits
EXC = set(json.load(open('/home/claude/pcs/exceptions.json')))
day_of = {}
for h in new:
    day_of.setdefault(h['w'], h['day'])
for w in list(oldw) + [h['w'] for h in new] + [h['w'] for h in hsk] + list(EXC):
    jieba.add_word(w, freq=2000)

def allowed(day):
    s = set(oldw) | KNOWN_FROM_OLD_EX | EXC
    s |= {w for w, d in day_of.items() if d <= day}
    return s

def tokens(zh):
    zh = re.sub(r'[^㐀-鿿]', ' ', zh)
    return [t for t in jieba.lcut(zh) if t.strip()]

def check(zh, day, target=None):
    A = allowed(day)
    bad, soft = [], []
    for t in tokens(zh):
        if t in A:
            continue
        # try splitting into allowed pieces greedily
        i, ok = 0, True
        while i < len(t):
            for L in range(len(t) - i, 0, -1):
                if t[i:i+L] in A:
                    i += L
                    break
            else:
                ok = False
                break
        (soft if ok else bad).append(t)
    used_target = target is None or target in zh
    return bad, soft, used_target

if __name__ == '__main__':
    files = sys.argv[1:]
    nb = {h['n']: h for h in new}
    total = 0
    for f in files:
        for line in open(f):
            if not line.strip():
                continue
            n, ko, zh, zk = line.rstrip('\n').split('\t')
            h = nb[int(n)]
            bad, soft, used = check(zh, h['day'], h['w'])
            total += 1
            if bad or not used:
                print('BAD ', n, h['w'], 'D%d' % h['day'], zh, bad, '' if used else 'TARGET-MISSING')
            elif soft:
                print('soft', n, h['w'], zh, soft)
    print('checked', total)
