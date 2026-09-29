const fs = require('fs');
const path = require('path');
const { isAuthed } = require('./_lib');

// Lista os arquivos que a IA deixou no sistema (entregas/manifest.json).
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'entregas', 'manifest.json'), 'utf8'));
    const out = { aulas: {} };
    for (const [aula, etapas] of Object.entries(m.aulas || {})) {
      out.aulas[aula] = {};
      for (const [etapa, arqs] of Object.entries(etapas)) {
        out.aulas[aula][etapa] = arqs.map((a) => {
          let size = 0;
          try { size = fs.statSync(path.join(__dirname, '..', 'entregas', a.file)).size; } catch (e) {}
          return { name: a.name, desc: a.desc || '', size, url: '/api/arquivo?f=' + encodeURIComponent(a.file) };
        });
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ aulas: {} });
  }
};
