const { readDb, writeDb, isAuthed, readBody } = require('./_lib');

// Mesmo contrato do server.py original: GET devolve o banco, POST grava o banco inteiro.
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await readDb());
    if (req.method === 'POST') {
      const data = await readBody(req);
      if (!data || !Array.isArray(data.aulas)) return res.status(400).json({ ok: false, error: 'Corpo inválido' });
      await writeDb(data);
      return res.status(200).json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
