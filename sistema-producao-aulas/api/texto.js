const { redis, isAuthed, readBody } = require('./_lib');

// Textos gerados (ficam no Redis, fora do banco principal para não pesá-lo).
// GET ?aula=&topico=  -> { nos: { <noId>: {texto, ts, ...} } }
// PUT {aulaId, topicoId, noId, texto} -> salva edição manual
// DELETE ?aula=&topico= -> apaga todos os textos do tópico
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const key = (a, t) => `ttpa:txt:${String(a)}:${String(t)}`;
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', key(req.query.aula, req.query.topico)])) || [];
      const nos = {};
      for (let i = 0; i < flat.length; i += 2) { try { nos[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {} }
      return res.status(200).json({ nos });
    }
    if (req.method === 'PUT') {
      const b = await readBody(req);
      if (!b.aulaId || !b.topicoId || !b.noId || typeof b.texto !== 'string') return res.status(400).json({ error: 'Pedido inválido' });
      await redis(['HSET', key(b.aulaId, b.topicoId), b.noId, JSON.stringify({ texto: b.texto, ts: Date.now(), editado: true })]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await redis(['DEL', key(req.query.aula, req.query.topico)]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
