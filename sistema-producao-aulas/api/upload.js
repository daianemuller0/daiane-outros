const { handleUpload } = require('@vercel/blob/client');
const { isAuthed, readBody } = require('./_lib');

// Upload direto do navegador para o Blob (sem limite de 4,5 MB da função).
// Este endpoint só emite o token; o arquivo vai do navegador ao Blob.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = await readBody(req);
    // O aviso "upload concluído" vem do Blob (sem cookie) e é validado pela assinatura.
    if (body.type === 'blob.generate-client-token' && !isAuthed(req))
      return res.status(401).json({ error: 'Não autenticado' });
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^uploads\//.test(pathname) || pathname.includes('..')) throw new Error('Caminho inválido');
        return { addRandomSuffix: false, allowOverwrite: true, maximumSizeInBytes: 100 * 1024 * 1024 };
      },
      onUploadCompleted: async () => {},
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
