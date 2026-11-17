"""Validate and record paragraph review; apply accepted changes at the end."""
import json, re, sys, hashlib
from pathlib import Path
A=Path(__file__).resolve().parent
W=A.parents[2]
def read(p):return json.loads(p.read_text())
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
M=read(A/'manifest.json'); P={p['id']:p for p in M['paragraphs']}
rejection_path=A/'review-rejections.json'
rejections=read(rejection_path) if rejection_path.exists() else []
def accepted_changes(i, changes):
 return [c for c in changes if not any(x['id']==i and x['old']==c['old'] for x in rejections)]
if sys.argv[1]=='review':
 ids=list(map(int,sys.argv[2:])); D=read(A/'review-decisions.json'); done={x['id'] for x in D}
 progress=read(A/'progress.json')
 for i in ids:
  r=read(A/f'reports/p{i:03d}.json'); md=(A/f'paragraphs/p{i:03d}.md').read_text();assert r['id']==i and len(md)>100
  spans=[]
  for c in r['changes']:
   assert P[i]['translation'].count(c['old'])==1,(i,c['old']); s=P[i]['translation'].index(c['old']);e=s+len(c['old']);assert not any(s<b and a<e for a,b in spans),(i,'overlap');spans.append((s,e))
  kept=accepted_changes(i,r['changes'])
  if i not in done:D.append({'id':i,'status':'reviewed','reason':'协调主审核对法语依据、中文表达、前后文及报告逐句覆盖；具体决定见原始建议和主审记录。'})
  decision=next(x for x in D if x['id']==i)
  decision['accepted']=len(kept)
  decision['rejected']=len(r['changes'])-len(kept)
  if decision['rejected']:
   decision['reason']='已逐句主审核对完整报告；采纳部分建议，不采纳项及理由见review-rejections.json，原始报告保留。'
  assert str(i) in progress['agents'], (i, 'record actual dispatched agent before review')
  if i not in progress['completed']:progress['completed'].append(i)
 D.sort(key=lambda x:x['id']);progress['completed'].sort();write(A/'review-decisions.json',D);write(A/'progress.json',progress)
 print(f"{len(progress['completed'])}/239",'reviewed',ids)
elif sys.argv[1]=='apply':
 import subprocess
 path=W/M['translation_path']
 original=subprocess.check_output(['git','show',M['base']+':'+M['translation_path']],cwd=W).decode()
 assert hashlib.sha256(original.encode()).hexdigest()==M['translation_sha256']
 def split(text):
  pieces=re.split(r'(\n\s*\n)',text)
  indices=[j for j in range(0,len(pieces),2) if pieces[j].strip()]
  assert len(indices)==239
  return pieces,indices
 previous=read(A/'applied.json')
 prior,idx=split(original)
 for c in previous:
  j=idx[c['id']-1];assert prior[j].count(c['old'])==1,(c['id'],'cannot replay existing change')
  prior[j]=prior[j].replace(c['old'],c['new'],1)
 assert ''.join(prior)==path.read_text(),'dev contains changes outside existing applied record'
 pieces,idx=split(original)
 adjustments=read(A/'review-adjustments.json')
 supplements=read(A/'supplemental-changes.json')
 decisions=read(A/'review-decisions.json')
 applied=[]
 for d in sorted(decisions,key=lambda x:x['id']):
  i=d['id'];r=read(A/f'reports/p{i:03d}.json');t=pieces[idx[i-1]]
  assert t.strip()==P[i]['translation'],i
  kept=accepted_changes(i,r['changes'])
  assert d['accepted']==len(kept)
  for c in kept + [{k:v for k,v in x.items() if k in ['old','new','reason']} for x in supplements if x['id']==i]:
   c=dict(c)
   for adjustment in adjustments:
    if adjustment['id']==i and adjustment['old']==c['old']:
     c['reason']=adjustment['reason']
     if 'new' in adjustment:c['new']=adjustment['new']
   assert t.count(c['old'])==1,(i,c['old'])
   assert c['new']!=c['old'],(i,'no-op must be recorded as rejected or retained')
   t=t.replace(c['old'],c['new'],1)
   applied.append({'id':i,**c,'decision':'accepted'})
  pieces[idx[i-1]]=t
 result=''.join(pieces)
 target=path.with_suffix('.checkpoint-tmp');target.write_text(result);target.replace(path)
 write(A/'applied.json',applied)
 print('checkpoint',len(decisions),'/239; applied',len(applied),'changes')
