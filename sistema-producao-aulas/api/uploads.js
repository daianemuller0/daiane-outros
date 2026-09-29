const { list } = require('@vercel/blob');
const { isAuthed } = require('./_lib');

const safe = (s) => String(s || '').replace(/[^\w\-. ()À-ſ]/g, '_');

module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const aula = safe(req.query.aula);
    const prefix = 'uploads/' + aula + '/';
    const { blobs } = await list({ prefix, limit: 500 });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ files: blobs.map((b) => ({ name: b.pathname.slice(prefix.length), size: b.size, url: b.url })) });
  } catch (e) {
    res.status(500).json({ files: [], error: e.message });
  }
};
