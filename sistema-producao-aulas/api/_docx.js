// Monta o Word da teoria a partir do MODELO da SI01 (estilos, capa, cabeçalho/rodapé, quadro Essencial de Prova).
// A IA só escreve o conteúdo; toda a formatação é aplicada aqui, por código.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const AZUL = '0070C0';
const VERMELHO = 'FF0000';
const NUM_LISTA = 37; // numeração de marcadores usada pelo modelo (PargrafodaLista)

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- runs (negrito / azul / vermelho) ----
function run(text, o) {
  if (!text) return '';
  let rpr = '';
  if (o.b) rpr += '<w:b/><w:bCs/>';
  if (o.cor) rpr += `<w:color w:val="${o.cor}"/>`;
  if (o.i) rpr += '<w:i/><w:iCs/>';
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*.+?\*\*|\{\{az:.+?\}\}|\{\{vm:.+?\}\})/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(run(text.slice(last, m.index), base));
    const t = m[0];
    if (t.startsWith('**')) out.push(run(t.slice(2, -2), { ...base, b: true }));
    else if (t.startsWith('{{az:')) out.push(run(t.slice(5, -2), { ...base, b: true, cor: AZUL }));
    else out.push(run(t.slice(5, -2), { ...base, b: true, cor: VERMELHO }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(run(text.slice(last), base));
  return out.join('');
}

// ---- blocos de parágrafo ----
const para = (text, ppr = '', base) => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs(text, base)}</w:p>`;
const item = (text) => `<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${NUM_LISTA}"/></w:numPr></w:pPr>${runs(text)}</w:p>`;
const CALLOUT = {
  'atenção': { style: 'Ateno', rot: 'Atenção: ' },
  'atencao': { style: 'Ateno', rot: 'Atenção: ' },
  'bizu': { style: 'Bizu', rot: 'Bizu: ' },
  'dica': { style: 'Barralateral', rot: 'Dica: ' },
  'exemplificando': { style: 'Barralateral', rot: 'Exemplificando: ' },
  'esclarecendo': { style: 'Barralateral', rot: 'Esclarecendo: ' },
  'barra': { style: 'Barralateral', rot: '' },
};
function tabela(linhas) {
  const cel = (c) => c.trim().replace(/^\||\|$/g, '');
  const linhasOk = linhas.filter((l) => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(l));
  const rows = linhasOk.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const n = Math.max(...rows.map((r) => r.length));
  const w = Math.floor(8500 / n);
  const total = w * n;
  const borda = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="8EAADB"/>`).join('') + '</w:tblBorders>';
  let x = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borda}<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + w + '"/>'.repeat(n)}</w:tblGrid>`;
  rows.forEach((r, i) => {
    x += '<w:tr>' + (i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
    for (let k = 0; k < n; k++) {
      const shade = i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="0E57C4"/>' : '';
      const base = i === 0 ? { b: true, cor: 'FFFFFF' } : {};
      x += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="left"/></w:pPr>${runs(cel(r[k] || ''), base)}</w:p></w:tc>`;
    }
    x += '</w:tr>';
  });
  return x + '</w:tbl><w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>';
}
// Converte o texto (Markdown simples + marcações da IA) em parágrafos Word.
function blocos(texto) {
  const L = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (!l.trim()) continue;
    if (/^\s*\|/.test(l)) {
      const t = [];
      while (i < L.length && /^\s*\|/.test(L[i])) t.push(L[i++]);
      i--;
      out.push(tabela(t));
    } else if (/^\s*\[figura[^\]]*\]\s*$/i.test(l)) {
      out.push('<w:p><w:r><w:rPr><w:b/><w:bCs/><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">[figura]</w:t></w:r></w:p>');
    } else if (/^\s*[-*•]\s+/.test(l)) {
      out.push(item(l.replace(/^\s*[-*•]\s+/, '')));
    } else if (/^\s*>\s*\[([^\]]+)\]/.test(l)) {
      const m = /^\s*>\s*\[([^\]]+)\]\s*:?\s*(.*)$/.exec(l);
      const c = CALLOUT[m[1].trim().toLowerCase()] || { style: 'Barralateral', rot: m[1].trim() + ': ' };
      out.push(para(c.rot ? `**${c.rot}**${m[2]}` : m[2], `<w:pStyle w:val="${c.style}"/>`));
    } else {
      out.push(para(l.trim()));
    }
  }
  return out.join('');
}

// ---- DOM helpers ----
const ser = new XMLSerializer();
const parse = (s) => new DOMParser().parseFromString(s, 'text/xml');
const NS = `xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"`;
function setText(p, texto) {
  const ts = Array.from(p.getElementsByTagNameNS(W, 't'));
  if (!ts.length) return;
  ts[0].textContent = texto;
  for (let i = 1; i < ts.length; i++) ts[i].textContent = '';
}
function children(el) { const r = []; for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) r.push(c); return r; }
const lname = (n) => n.localName || n.nodeName.replace(/^.*:/, '');

// Quadro "Essencial de Prova": reaproveita o shape do modelo, troca os textos e ajusta a altura.
function quadroEssencial(modeloXml, texto, titulo) {
  let xml = modeloXml;
  const doc = parse(`<r ${NS}>${xml}</r>`);
  const p = doc.documentElement.firstChild;
  const linhas = String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const intro = [], bullets = [];
  linhas.forEach((l) => { if (/^[-*•]\s+/.test(l)) bullets.push(l.replace(/^[-*•]\s+/, '')); else intro.push(l); });
  const tbs = Array.from(p.getElementsByTagNameNS(W, 'txbxContent'));
  tbs.forEach((tb) => {
    const ps = children(tb);
    const primeiro = ps[0];
    const modIntro = ps.find((x, i) => i > 0 && !/PargrafodaLista/.test(ser.serializeToString(x).slice(0, 400)));
    const modItem = ps.find((x) => /PargrafodaLista/.test(ser.serializeToString(x).slice(0, 600)));
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    const mk = (modelo, conteudo) => {
      const nv = modelo.cloneNode(true);
      Array.from(nv.childNodes).forEach((c) => { if (lname(c) !== 'pPr') nv.removeChild(c); });
      const frag = parse(`<r ${NS}>${runs(conteudo)}</r>`).documentElement;
      children(frag).forEach((c) => nv.appendChild(doc.importNode(c, true)));
      return nv;
    };
    tb.appendChild(primeiro.cloneNode(true));
    (intro.length ? intro : [titulo ? `${titulo}:` : 'Essencial de prova:']).forEach((t) => tb.appendChild(mk(modIntro || modItem, t)));
    bullets.forEach((t) => tb.appendChild(mk(modItem, t)));
  });
  xml = ser.serializeToString(p);
  // "Redimensionar forma para ajustar ao texto": o Word ajusta a altura do quadro ao conteúdo
  xml = xml.replace(/<a:noAutofit\s*\/>/g, '<a:spAutoFit/>');
  // altura inicial estimada (o ajuste automático refina)
  const todos = intro.concat(bullets);
  const linhasN = todos.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / 46)), 0);
  const novoCy = Math.max(1500000, Math.round(900000 + linhasN * 195000 + todos.length * 76200 + 200000));
  const cyAntigo = (xml.match(/<wp:extent cx="\d+" cy="(\d+)"/) || [])[1];
  if (cyAntigo) {
    xml = xml.split(`cy="${cyAntigo}"`).join(`cy="${novoCy}"`);
    const ptAntigo = Number(cyAntigo) / 12700, ptNovo = novoCy / 12700;
    xml = xml.replace(/height:\s*([\d.]+)pt/g, (m, h) => (Math.abs(Number(h) - ptAntigo) < 1 ? `height:${ptNovo.toFixed(1)}pt` : m));
  }
  return xml;
}

// aula: { titulo, disciplina, topicos:[{ nome, essencial, itens:[{ nivel, nome, texto }] }] }
async function montarDocx(aula) {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, '..', 'templates', 'teoria-modelo-SI01.docx')));
  const docXml = await zip.file('word/document.xml').async('string');
  const dom = parse(docXml);
  const body = dom.getElementsByTagNameNS(W, 'body')[0];
  const kids = children(body);
  const sectPr = kids[kids.length - 1];
  const capa = kids[0], tit = kids[1], sub = kids[2], teoria = kids[3], h1Modelo = kids[6], essModelo = kids[7];
  const essXml = ser.serializeToString(essModelo);
  const h1Xml = ser.serializeToString(h1Modelo);

  const nomeAula = String(aula.titulo || '').replace(/^TI TOTAL\s*-\s*\S+\s*-\s*/i, '').trim();
  setText(tit, nomeAula.toUpperCase());
  setText(sub, aula.topicos.map((t) => t.nome).join('. ') + '.');

  let corpo = '';
  corpo += ser.serializeToString(capa) + ser.serializeToString(tit) + ser.serializeToString(sub) + ser.serializeToString(teoria);
  // Sumário: campo TOC (o Word atualiza ao abrir)
  corpo += `<w:p><w:pPr><w:pStyle w:val="CabealhodoSumrio"/></w:pPr>${run('Sumário', {})}</w:p>`;
  corpo += '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Atualize o sumário (F9 / clique com o botão direito → Atualizar campo).</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';

  aula.topicos.forEach((t) => {
    // Título do tópico (estilo Título 1 do modelo, numeração automática do estilo)
    const h1 = parse(`<r ${NS}>${h1Xml}</r>`).documentElement.firstChild;
    setText(h1, t.nome);
    let h1s = ser.serializeToString(h1);
    if (!/pageBreakBefore/.test(h1s)) h1s = h1s.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>');
    corpo += h1s;
    if (t.essencial && String(t.essencial).trim()) corpo += quadroEssencial(essXml, t.essencial, `${t.nome} — essencial de prova`);
    corpo += '<w:p/>';
    if (t.abertura && String(t.abertura).trim()) corpo += blocos(t.abertura) + '<w:p/>';
    (t.itens || []).forEach((it) => {
      const est = it.nivel <= 2 ? 'Ttulo2' : it.nivel === 3 ? 'Ttulo3' : 'Ttulo4';
      corpo += `<w:p><w:pPr><w:pStyle w:val="${est}"/></w:pPr>${run(it.nome, {})}</w:p>`;
      corpo += blocos(it.texto);
      corpo += '<w:p/>';
    });
  });
  corpo += ser.serializeToString(sectPr);

  const ini = docXml.slice(0, docXml.indexOf('<w:body>') + 8);
  zip.file('word/document.xml', ini + corpo + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { montarDocx, blocos, runs };
