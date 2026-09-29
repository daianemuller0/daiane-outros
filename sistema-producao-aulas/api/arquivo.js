const fs = require('fs');
const path = require('path');
const { isAuthed } = require('./_lib');

const ROOT = path.join(__dirname, '..', 'entregas');
const TYPES = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
};

// Download (protegido por login) dos arquivos entregues pela IA.
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  const full = path.resolve(ROOT, String(req.query.f || ''));
  if (!full.startsWith(ROOT + path.sep) || !fs.existsSync(full)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.setHeader('Content-Type', TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(full)));
  res.status(200).end(fs.readFileSync(full));
};
