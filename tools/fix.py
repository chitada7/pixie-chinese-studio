import sys
f=sys.argv[1]; fix={}
for l in open(sys.argv[2]):
    if l.strip():
        n,z,k=l.rstrip('\n').split('\t'); fix[int(n)]=(z,k)
L=open(f).read().splitlines();out=[]
for l in L:
    p=l.split('\t')
    if int(p[0]) in fix: p[2],p[3]=fix[int(p[0])]
    out.append('\t'.join(p))
open(f,'w').write('\n'.join(out)+'\n')
