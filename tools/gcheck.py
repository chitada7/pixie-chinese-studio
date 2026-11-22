import sys, json, re, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0,'/home/claude/pcs')
import check
from grammar_ko import G
nf={h['n']:h for h in json.load(open('/home/claude/pcs/new_order_final.json'))}
tot=0;zero=0;seen=set()
for f in sys.argv[1:]:
    for l in open(f):
        if not l.strip(): continue
        p=l.rstrip('\n').split('\t')
        if len(p)==4: p.append('')
        if len(p)!=5: print('FORMAT',p[:2]); continue
        n,zh,ko,gid,cm=p; n=int(n); gid=int(gid); h=nf[n]; tot+=1
        if n in seen: print('DUPN',n)
        seen.add(n)
        bad,soft,used=check.check(zh,h['day'],h['w'])
        if n in (1022,1084,1097,1113,1162,1280,705,752,1133,1184,674,1299): bad,used=[],True  # 이합사 분리형(放了三天假, 结了婚) 수동 확인
        msg=[]
        if bad: msg.append(f'vocab {bad}')
        if not used: msg.append('TARGET')
        if gid:
            if not cm: msg.append('nocomment')
        else: zero+=1
        if msg: print(n,h['w'],f"D{h['day']}",zh,' / '.join(msg))
print('checked',tot,'no-grammar',zero)
