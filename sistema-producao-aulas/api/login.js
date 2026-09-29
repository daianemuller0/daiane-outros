const { checkPassword, sessionCookie, readBody, isAuthed } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ authed: isAuthed(req) });
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'ttpa=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { senha } = await readBody(req);
    if (!checkPassword(senha)) return res.status(401).json({ error: 'Senha incorreta' });
    res.setHeader('Set-Cookie', sessionCookie());
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Requisição inválida' });
  }
};
