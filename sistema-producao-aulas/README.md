# Sistema de Produção de Aulas — TI TOTAL (Vercel)

Painel + modo guiado das etapas + cronômetro. Dados em Upstash Redis, anexos no Vercel Blob.

## Deploy
1. Vercel → *Add New Project* → importe `daiane-outros` e defina **Root Directory** = `sistema-producao-aulas`.
2. *Storage* → adicione **Upstash Redis** (Marketplace) e **Blob** ao projeto (as variáveis `KV_REST_API_URL`, `KV_REST_API_TOKEN` e `BLOB_READ_WRITE_TOKEN` são criadas sozinhas).
3. *Settings → Environment Variables*: `APP_PASSWORD` (senha da equipe) e, opcional, `AUTH_SECRET` (texto aleatório longo).
4. Redeploy. Em *Etapas* (menu), ajuste os nomes das 14 etapas.
