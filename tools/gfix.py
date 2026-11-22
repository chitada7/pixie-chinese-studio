import sys
f=sys.argv[1];L=open(f).read().splitlines()
fix={l.split('\t')[0]:l for l in open(sys.argv[2]).read().splitlines() if l.strip()}
out=[fix.pop(l.split('\t')[0],l) for l in L]+list(fix.values())
out.sort(key=lambda l:int(l.split('\t')[0]))
open(f,'w').write('\n'.join(out)+'\n')
