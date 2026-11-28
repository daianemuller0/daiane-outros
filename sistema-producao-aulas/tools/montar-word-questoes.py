import re,json,glob,sys,zipfile,shutil,os,collections,html
OUT=sys.argv[1] if len(sys.argv)>1 else 'out.docx'
TOTAL=200
# ---------- 1) ler PDFs ----------
qs={}
for f in sorted(glob.glob('*.txt')):
    t=open(f,encoding='utf8').read().replace('\x0c','')
    L=[l.rstrip() for l in t.split('\n')
       if not re.match(r'^\s*\d\d/\d\d/\d{4}, \d\d:\d\d\s+Caderno',l)
       and not re.match(r'^\s*https://www\.tecconcursos\.com\.br/questoes/cadernos/\d+/imprimir',l)]
    txt='\n'.join(L)
    gi=txt.find('\n Gabarito')
    body=txt[:gi] if gi>0 else txt
    gab={int(n):v for n,v in re.findall(r'(\d+)\)\s+(Certo|Errado|[A-E])\b',txt[gi:])} if gi>0 else {}
    blocks=re.split(r'\n\s*www\.tecconcursos\.com\.br/questoes/(\d+)\s*\n',body)
    for i in range(1,len(blocks),2):
        qid=blocks[i]; lines=blocks[i+1].split('\n')
        nz=[j for j,x in enumerate(lines) if x.strip()]
        k=next(j for j in nz if nz.index(j)>=2 and re.match(r'^\s*\d+\)\s',lines[j]))
        pre=[lines[j].strip() for j in nz if j<k]
        assunto=pre[-1]; ref=' '.join(pre[:-1])
        m=re.match(r'^\s*(\d+)\)\s*(.*)',lines[k]); n=int(m.group(1))
        raw=[m.group(2)]+lines[k+1:]
        # parágrafos
        paras=[];cur=[]
        def flush():
            global cur
            if cur: paras.append(' '.join(cur)); cur=[]
        alts=[]
        for x in raw:
            s=x.strip()
            if not s: flush(); continue
            if s in('Certo','Errado'): flush(); continue
            if re.match(r'^[a-e]\)\s',s): flush(); alts.append(s); continue
            if alts and not re.match(r'^(\(\s*\)|•)',s): alts[-1]+=' '+s; continue
            if re.match(r'^(\(\s*\)|•|I{1,3}[\.\)\-]|IV[\.\)\-]|V[\.\)\-]|VI{0,3}[\.\)\-])\s',s): flush()
            cur.append(s)
        flush()
        if qid in qs: continue
        qs[qid]=dict(id=qid,n=n,ref=ref,assunto=assunto,paras=paras,alts=alts,gab=gab.get(n))
Q=list(qs.values())
print('questões únicas:',len(Q),'sem gabarito:',sum(1 for q in Q if not q['gab']))
# ---------- 2) classificar ----------
def banca(ref):
    b=ref.split(' - ')[0].upper()
    for k in ('CEBRASPE','FGV','FCC','VUNESP','CESGRANRIO'):
        if b.startswith(k): return k
    return 'OUTRA'
def anoOf(ref):
    m=re.search(r'/(\d{4})\s*$',ref); return int(m.group(1)) if m else 0
def refFmt(ref):
    b=banca(ref); seg=ref.split(' - ',1)[1].split('/') if ' - ' in ref else ['','']
    cargo=seg[0].strip(); org=seg[1].strip() if len(seg)>1 else ''
    return '(%s – %d – %s – %s)'%(b,anoOf(ref),org,cargo)
TOP={1:'Criptografia',2:'Funções Hash',3:'Assinatura Digital',4:'Certificado Digital'}
def topico(q):
    a=q['assunto'].lower(); body=(' '.join(q['paras'])+' '+' '.join(q['alts'])).lower()
    if 'hashes' in a: return 2
    if a.endswith('assinatura digital'): return 3
    if 'certificado digital' in a and 'criptografia, assinatura' not in a or 'icp e autoridades' in a or a.endswith('x.509'): return 4
    if 'conceitos de criptografia' in a or 'algoritmos de criptografia' in a: return 1
    # genéricos: por palavras-chave
    if re.search(r'certificado|icp|x\.509|autoridade certificadora|\bac\b',body): return 4
    if re.search(r'\bhash|sha-?\d|md5|resumo criptogr',body): return 2
    return 1
for q in Q:
    q['banca']=banca(q['ref']); q['ano']=anoOf(q['ref']); q['top']=topico(q); q['refF']=refFmt(q['ref'])
Q=[q for q in Q if q['banca']!='OUTRA']
print('por tópico (todas):',collections.Counter(q['top'] for q in Q)); print('bancas:',collections.Counter(q['banca'] for q in Q))
# ---------- 3) selecionar (mais recentes primeiro) ----------
sizes=collections.Counter(q['top'] for q in Q)
quota={t:int(TOTAL*sizes[t]/len(Q)) for t in sizes}
resto=TOTAL-sum(quota.values())
for t,_ in sorted(((t,(TOTAL*sizes[t]/len(Q))-quota[t]) for t in sizes),key=lambda x:-x[1])[:resto]: quota[t]+=1
sel=[]
for t in sorted(sizes):
    c=sorted([q for q in Q if q['top']==t],key=lambda q:(-q['ano'],q['n']))
    sel+=c[:quota[t]]
print('quota:',quota,'selecionadas:',len(sel),collections.Counter(q['banca'] for q in sel),collections.Counter(q['ano'] for q in sel))
ORD=['CEBRASPE','FCC','FGV','VUNESP','CESGRANRIO','OUTRA']
groups=collections.OrderedDict()
for t in sorted(TOP):
    for b in ORD:
        g=sorted([q for q in sel if q['top']==t and q['banca']==b],key=lambda q:(-q['ano'],q['n']))
        if g: groups[(t,b)]=g
json.dump([dict(top=t,banca=b,ids=[q['id'] for q in g]) for (t,b),g in groups.items()],open('sel.json','w'))
# ---------- 4) montar docx a partir do modelo SI02 (capa, sumário, cabeçalho/rodapé, numeração) ----------
TPL='/home/user/daiane-outros/sistema-producao-aulas/entregas/si02mp/TI TOTAL - SI02 - Questões.docx'
z=zipfile.ZipFile(TPL); doc=z.read('word/document.xml').decode('utf8')
esc=lambda s: html.escape(s,quote=False)
SZ=26   # Segoe UI 13
def run(t,bold=False,color=None,font='Segoe UI'):
    rp='<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>'%(font,font,font)+('<w:b/>' if bold else '')+('<w:color w:val="%s"/>'%color if color else '')+'<w:sz w:val="%d"/></w:rPr>'%SZ
    return '<w:r>'+rp+'<w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>'
def hd(level,text,pb=False):
    fill={1:'002060',2:'002060',3:'0E57C4'}[level]; sz={1:40,2:32,3:28}[level]
    spb={1:'w:before="80" w:after="40"',2:'w:before="40" w:after="80"',3:'w:before="40" w:after="40"'}[level]
    return ('<w:p><w:pPr><w:pStyle w:val="Heading%d"/>%s<w:shd w:val="clear" w:color="auto" w:fill="%s"/><w:spacing %s w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:outlineLvl w:val="%d"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Montserrat" w:hAnsi="Montserrat" w:cs="Montserrat"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="%d"/></w:rPr><w:t>%s</w:t></w:r></w:p>'
            %(level,'<w:pageBreakBefore/>' if pb else '',fill,spb,level-1,sz,esc(text)))
def qhead(numid,ref,first):
    return ('<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="%d"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="539"/></w:tabs><w:ind w:left="0" w:firstLine="0"/><w:jc w:val="both"/></w:pPr>'%numid)+run(ref,True)+run(' '+first)+'</w:p>'
def ptxt(t): return '<w:p><w:pPr><w:jc w:val="both"/></w:pPr>'+run(t)+'</w:p>'
def qbody(numid,q):
    ps=q['paras'] or ['']
    x=qhead(numid,q['refF'],ps[0])
    for p in ps[1:]: x+=ptxt(p)
    for a in q['alts']: x+=ptxt(a)
    return x
BAR='<w:pBdr><w:left w:val="single" w:sz="12" w:space="4" w:color="0070C0"/></w:pBdr>'
def resol(q):
    g=q['gab'] or '—'
    if g=='Certo': gv,cor='Certo.','0E57C4'
    elif g=='Errado': gv,cor='Errado.','FF0000'
    else: gv,cor='Letra '+g+'.','00B050'
    x='<w:p><w:pPr><w:keepNext/></w:pPr>'+run('Resolução:',True)+'</w:p><w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>'
    x+='<w:p><w:pPr><w:keepNext/>'+BAR+'<w:jc w:val="left"/></w:pPr>'+run('📘',False,None,'Segoe UI Emoji')+run(' Teoria:',True)+'</w:p>'
    x+='<w:p><w:pPr>'+BAR+'<w:jc w:val="both"/></w:pPr></w:p>'
    x+='<w:p>'+run('Gabarito: ',True)+run(gv,True,cor)+'</w:p>'
    return x
def gabtable(items,start):
    W=10772//5
    rows=''
    for r0 in range(0,len(items),5):
        cells=''
        for c in range(5):
            if r0+c<len(items):
                q=items[r0+c]; n=start+r0+c
                inner=run('%d-'%n,True)+run('  '+(q['gab'] or '—'))
            else: inner=''
            cells+='<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>%s</w:p></w:tc>'%(W,inner)
        rows+='<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>'%cells
    nb=''.join('<w:%s w:val="nil"/>'%k for k in ('top','left','bottom','right','insideH','insideV'))
    return ('<w:tbl><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>%s</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>'
            %(W*5,nb,'<w:gridCol w:w="%d"/>'%W*5,rows))+'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>'
x=''
def secao(titulo,kind):
    global x
    x+=hd(1,titulo,pb=True)
    lastT=None; n=1
    for (t,b),g in groups.items():
        if t!=lastT: x+=hd(2,'%d.    %s'%(t,TOP[t]),pb=(lastT is not None)); lastT=t
        x+=hd(3,b)
        if kind=='gab': x+=gabtable(g,n)
        else:
            for q in g: x+=qbody(10 if kind=='com' else 11,q)+(resol(q) if kind=='com' else '')
        n+=len(g)
secao('QUESTÕES COMENTADAS','com'); secao('LISTA DE QUESTÕES','lista'); secao('GABARITO','gab')
# página 2: QUESTÕES / matéria / tópicos (bloco navy), antes do CONTEÚDO DA AULA
def ap(t,sz=36):
    return '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="002060"/><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Montserrat" w:hAnsi="Montserrat" w:cs="Montserrat"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="%d"/></w:rPr><w:t>%s</w:t></w:r></w:p>'%(sz,esc(t))
apres=ap('QUESTÕES')+ap('CRIPTOGRAFIA')+ap('. '.join(TOP[t] for t in sorted(TOP))+'.')+'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>'
j0=doc.index('<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="002060"/><w:spacing w:before="80" w:after="80"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Montserrat" w:hAnsi="Montserrat" w:cs="Montserrat"/><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="40"/></w:rPr><w:t>CONTEÚDO DA AULA')
ini=doc.index('<w:p><w:pPr><w:pStyle w:val="Heading1"/>')
fim=doc.rindex('<w:sectPr w:rsidR=')
SECT=('<w:sectPr><w:headerReference w:type="default" r:id="rId10"/><w:footerReference w:type="default" r:id="rId11"/><w:pgSz w:w="11906" w:h="16838"/>'
      '<w:pgMar w:top="1134" w:right="567" w:bottom="1417" w:left="567" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>')
new=doc[:j0]+apres+doc[j0:ini]+x+SECT+'</w:body></w:document>'
zo=zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED)
for it in z.infolist():
    data=z.read(it.filename)
    if it.filename=='word/document.xml': data=new.encode('utf8')
    zo.writestr(it.filename,data)
zo.close(); print('ok ->',OUT,len(sel),'questões')
