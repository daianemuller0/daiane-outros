# Sistema de Produção de Aulas — TI TOTAL (Vercel)

Interface original (`public/index.html`) adaptada para o Vercel: login por senha, dados no Upstash Redis, anexos no Vercel Blob. O servidor local antigo está em `local-original-server.py` (referência).

## Deploy
1. Vercel → *Add New Project* → importe `daiane-outros` e defina **Root Directory** = `sistema-producao-aulas`.
2. *Storage* → adicione **Upstash Redis** (Marketplace) e **Blob** ao projeto (o Blob cria `BLOB_READ_WRITE_TOKEN`; para o Redis use `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`).
3. *Settings → Environment Variables*: `APP_PASSWORD` (senha da equipe) e, opcional, `AUTH_SECRET` (texto aleatório longo).
4. Redeploy.
