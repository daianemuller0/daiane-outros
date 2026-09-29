const { redis, isAuthed, readBody } = require('./_lib');
const { montarDocx } = require('./_docx');

// Monta o Word da teoria (modelo da SI01) com os textos já produzidos.
// Corpo: { aulaId, titulo, topicos: [{ id, nome, itens: [{ id, nivel, nome }] }] }
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const b = await readBody(req);
    if (!b || !b.aulaId || !Array.isArray(b.topicos)) return res.status(400).json({ error: 'Pedido inválido' });
    const topicos = [];
    for (const t of b.topicos) {
      const flat = (await redis(['HGETALL', `ttpa:txt:${b.aulaId}:${t.id}`])) || [];
      const tx = {};
      for (let i = 0; i < flat.length; i += 2) { try { tx[flat[i]] = JSON.parse(flat[i + 1]).texto; } catch (e) {} }
      const itens = (t.itens || []).filter((x) => tx[x.id]).map((x) => ({ nivel: x.nivel, nome: x.nome, texto: tx[x.id] }));
      if (itens.length || tx.essencial) topicos.push({ nome: t.nome, essencial: tx.essencial || '', itens });
    }
    if (!topicos.length) return res.status(404).json({ error: 'Ainda não há texto produzido para montar o Word.' });
    const buf = await montarDocx({ titulo: b.titulo, topicos });
    const nome = String(b.arquivo || 'Teoria').replace(/[^\w .\-()À-ſ]/g, '_') + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(nome));
    res.status(200).end(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
