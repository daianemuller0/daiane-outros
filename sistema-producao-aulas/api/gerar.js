const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { redis, isAuthed, readBody } = require('./_lib');

// Modelo: claude-opus-5-5 por padrão. Para gastar menos, defina ANTHROPIC_MODEL=claude-sonnet-5-5 no Vercel.
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SISTEMA = `Você é o elaborador de teoria da TI TOTAL, curso de preparação para concursos de TI. Escreve o texto teórico de uma aula, um item do sumário por vez, em português do Brasil.

PADRÃO DO TEXTO
- Foco em prova de concurso: explicação objetiva, correta e completa, sem enrolação.
- Definições em **negrito**. Termos-chave curtos (até 4 palavras) entre {{az:...}}. Negações, exceções e pegadinhas de prova entre {{vm:...}}. Use azul e vermelho com moderação.
- Parágrafos curtos. Use listas e tabelas em Markdown quando ajudarem (comparações entre conceitos próximos são muito valiosas).
- Não use títulos (#): o sistema já coloca o título do item. Se precisar subdividir, use apenas linhas em negrito.
- Não comente questões, não cite números de questão e não escreva "gabarito". Escreva apenas teoria.

REGRA OBRIGATÓRIA DE COBERTURA
Recebe, para cada item, as questões reais que ele precisa cobrir. O texto deve conter, de forma explícita e correta, o conhecimento necessário para justificar o gabarito de CADA questão listada, incluindo as exceções e pegadinhas que elas exploram. Se uma questão exigir um fato que não cabe neste item, diga o essencial dele em uma frase.

QUALIDADE
- Só afirme fatos técnicos de que tenha certeza. Se houver dúvida, omita ou marque com [VERIFICAR].
- Não invente normas, versões, números ou siglas.
- Siga as orientações do professor quando houver; elas têm prioridade.
- Retorne somente o texto do item, sem introdução nem despedida.`;

function questoesDoTopico(aulaId, topicoNome, topicoIdx) {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'entregas', String(aulaId).replace(/[^\w-]/g, ''), 'questoes.json'), 'utf8'));
    const lista = (all.aulas || {})[aulaId];
    if (!lista) return [];
    const t = lista.find((x) => norm(x.topico) === norm(topicoNome)) || lista[topicoIdx];
    return t ? t.questoes : [];
  } catch (e) {
    return [];
  }
}

function montarPedido(b, questoes) {
  const nosQ = (b.qs || []).map((n) => questoes.find((q) => q.n === n)).filter(Boolean);
  const blocoQ = nosQ.length
    ? nosQ.map((q) => `[Questão ${q.n}] ${q.ref}\n${q.texto}\nGabarito: ${q.gabarito}`).join('\n\n')
    : '(nenhuma questão do Word foi mapeada para este item)';
  const partes = [
    `AULA: ${b.aula || ''} — ${b.disciplina || ''}`,
    `TÓPICO: ${b.topico}`,
    `SUMÁRIO DO TÓPICO:\n${(b.sumario || []).join('\n')}`,
    `ITEM A ESCREVER: ${b.no.num} ${b.no.nome}`,
  ];
  if (b.tipo === 'essencial') {
    partes.push('TAREFA: escreva o quadro "Essencial de Prova" do tópico: de 6 a 10 tópicos curtos (uma linha cada), os pontos que mais caem em prova neste tópico, com base no sumário e nas questões abaixo. Não repita títulos.');
  } else if (b.no.temFilhos) {
    partes.push('TAREFA: este item tem sub-itens que serão escritos depois. Escreva apenas uma introdução curta (2 a 4 frases) que apresente o assunto e como ele se divide; não aprofunde o que pertence aos sub-itens.');
  } else {
    partes.push('TAREFA: escreva a teoria completa deste item (em geral 250 a 600 palavras), cobrindo as questões abaixo.');
  }
  if (b.anteriores && b.anteriores.length) partes.push('ITENS JÁ ESCRITOS NESTE TÓPICO (não repetir o conteúdo deles):\n' + b.anteriores.join('\n'));
  if (b.orientacoes) partes.push('ORIENTAÇÕES DO PROFESSOR (prioridade):\n' + b.orientacoes);
  if (b.feedback) partes.push('AJUSTES PEDIDOS NA REVISÃO (aplique-os):\n' + b.feedback);
  if (b.textoAnterior) partes.push('VERSÃO ANTERIOR DESTE ITEM (reescreva aplicando os ajustes):\n' + b.textoAnterior);
  partes.push('QUESTÕES DO WORD QUE ESTE ITEM DEVE COBRIR:\n' + blocoQ);
  return partes.join('\n\n');
}

async function chamar(client, pedido) {
  const base = {
    model: MODELO,
    max_tokens: 6000,
    output_config: { effort: 'low' },
    system: SISTEMA,
    messages: [{ role: 'user', content: pedido }],
  };
  // Streaming evita timeout; fallback server-side reexecuta em outro modelo se a segurança recusar.
  let msg;
  try {
    msg = await client.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (e) {
    if (e && e.status === 400) msg = await client.messages.stream(base).finalMessage();
    else throw e;
  }
  return msg;
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Não autenticado' });
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Vercel.' });
  try {
    const b = await readBody(req);
    if (!b || !b.aulaId || !b.topico || !b.no || !b.no.nome) return res.status(400).json({ error: 'Pedido inválido' });
    const questoes = questoesDoTopico(b.aulaId, b.topico, (b.topicoIdx || 1) - 1);
    const client = new Anthropic();
    const msg = await chamar(client, montarPedido(b, questoes));
    if (msg.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'A IA recusou este item por regras de segurança. Ajuste o item ou escreva-o manualmente.' });
    }
    const texto = msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (!texto) return res.status(502).json({ error: 'A IA não devolveu texto.' });
    const registro = { texto, ts: Date.now(), modelo: msg.model || MODELO, versao: (b.versao || 1) };
    if (b.topicoId && b.no.id) {
      await redis(['HSET', `ttpa:txt:${b.aulaId}:${b.topicoId}`, b.no.id, JSON.stringify(registro)]);
    }
    res.status(200).json({ texto, usage: { entrada: msg.usage.input_tokens, saida: msg.usage.output_tokens }, truncado: msg.stop_reason === 'max_tokens' });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'Erro ao gerar' });
  }
};
