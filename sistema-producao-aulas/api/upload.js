const { put } = require('@vercel/blob');
const { isAuthed } = require('./_lib');

// Upload via servidor (limite ~4,5 MB do Vercel). Nome do arquivo em ?nome=
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const nome = String(req.query.nome || 'arquivo').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const blob = await put('uploads/' + nome, req, { access: 'public', addRandomSuffix: true });
    res.status(200).json({ url: blob.url, nome });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
