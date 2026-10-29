const fs = require('fs');
const path = require('path');
const { isAuthed } = require('./_lib');

// Textos revisados pela Claude (ex.: a partir do feedback do especialista), prontos para "Aplicar" na etapa 1.5.
module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const dir = path.join(__dirname, '..', 'entregas');
    const out = { aulas: {} };
    for (const aula of fs.readdirSync(dir)) {
      const f = path.join(dir, aula, 'teoria-revisada.json');
      if (!fs.existsSync(f)) continue;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      Object.assign(out.aulas, j.aulas || {});
      Object.values(out.aulas).forEach((a) => { if (a && typeof a === 'object') a.versao = j.versao; });
    }
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ aulas: {} });
  }
};
