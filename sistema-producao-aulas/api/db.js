const { readDb, writeDb, isAuthed, readBody } = require('./_lib');

module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  try {
    if (req.method === 'GET') {
      const doc = await readDb();
      return res.status(200).json(doc || { version: 0, data: null });
    }
    if (req.method === 'PUT') {
      const { version, data } = await readBody(req);
      if (typeof version !== 'number' || !data || typeof data !== 'object')
        return res.status(400).json({ error: 'Corpo inválido' });
      const nv = await writeDb(version, data);
      if (nv === null) {
        const cur = await readDb();
        return res.status(409).json({ error: 'Conflito de versão', current: cur });
      }
      return res.status(200).json({ version: nv });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
