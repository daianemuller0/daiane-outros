const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { redis, isAuthed, readBody } = require('./_lib');

// Modelo: claude-opus-5-5 por padrão. Para gastar menos, defina ANTHROPIC_MODEL=claude-sonnet-5-5 no Vercel.
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SISTEMA = `Você é o elaborador de teoria da TI TOTAL, curso de preparação para concursos de TI. Escreve o texto teórico de uma aula, um item do sumário por vez, em português do Brasil. Você escreve APENAS o conteúdo: a formatação do Word (fontes, estilos, faixas, quadros) é aplicada depois pelo sistema.

PRINCÍPIO CENTRAL: TEXTO CURTO E DE LEITURA RÁPIDA
O texto principal deve ser rápido de ler. Em poucos segundos o aluno precisa entender o conceito. Não coloque no texto tudo o que se sabe sobre o assunto: detalhes e pegadinhas entram só quando realmente ajudam em prova. Densidade demais faz um conceito simples parecer complicado.
- Item folha (sem sub-itens): em geral de 100 a 220 palavras no total. Nunca passe de 300.
- Item com sub-itens: apenas 1 ou 2 frases de abertura.
- Comece direto pela definição. Sem contextualização, sem "em redes corporativas…", sem repetir o título.
- Definição em 1 a 3 frases. Depois, se ajudar, uma linha de fluxo em negrito (ex.: **Cliente → Proxy → Servidor de destino**) e uma linha [figura] quando o assunto se explicaria melhor com um esquema (o esquema é desenhado depois).
- Depois da definição, use uma lista curta introduzida por "Suas principais características são:" (ou frase equivalente). Cada marcador: **rótulo em negrito:** uma frase curta (até 20 palavras). Em geral de 3 a 6 marcadores.
- Não faça vários parágrafos explicativos, subdivisões em negrito, nem repita a mesma ideia em formas diferentes.
- No máximo 2 quadros por item, e só se acrescentarem algo que o texto não diz: um [Atenção] e/ou um [Bizu]. Não use [Exemplificando], [Dica] nem [Esclarecendo] a menos que o professor peça ou o caso seja claramente cobrado em prova. Cada quadro tem no máximo 2 frases.

MARCAÇÕES PERMITIDAS (o sistema converte para o Word)
- **negrito**: termo ou propriedade do conceito (a palavra ou expressão definida, ou uma característica).
- {{az:texto}}: NEGRITO AZUL = núcleo conceitual: definição direta, característica principal, termo central. Responde "o que é". Só o núcleo, em poucas palavras.
- {{vm:texto}}: NEGRITO VERMELHO = negação conceitual: ausência de propriedade, impossibilidade, exclusão, armadilha, limite da definição. Responde "o que NÃO é".
- Nunca use azul ou vermelho só para "destacar", nem em frases inteiras.
- Listas: linhas iniciadas por "- ". Tabelas Markdown com "|" só quando comparar conceitos próximos.
- Quadros: uma linha cada, no formato "> [Atenção] texto" ou "> [Bizu] texto" (também aceitos: [Dica], [Exemplificando], [Esclarecendo]). Atenção: só onde há risco real de confusão (exceção, limite conceitual, troca comum de conceitos). Bizu: memorização curta (macete, "procurador", padrão de cobrança).
- Figura: uma linha só com [figura].
- Não use títulos (#): o sistema já coloca o título do item. Não crie esquemas nem mapas mentais (são feitos depois). Não inclua questões, resoluções nem gabaritos.

EXEMPLO DO PADRÃO DESEJADO (só para o ESTILO e a extensão; não copie o conteúdo para outros itens). Item "Conceito de Proxy":
O **proxy** é um {{az:servidor intermediário}} que recebe requisições de um cliente e as encaminha a outro servidor, devolvendo depois a resposta obtida. Dessa forma, o cliente {{vm:não se comunica diretamente com o destino}}, o que permite controlar, filtrar e monitorar o tráfego.

**Cliente → Proxy → Servidor de destino**

[figura]

Suas principais características são:

- **Intermediação de conexões:** recebe e encaminha requisições entre cliente e servidor.
- **Controle de acesso e filtragem:** pode permitir ou bloquear sites, serviços ou conteúdos conforme políticas definidas.
- **Monitoramento e registro:** mantém logs dos acessos realizados.
- **Cache:** armazena conteúdos já acessados, reduzindo tráfego e tempo de resposta.
- **Ocultação de endereços:** o servidor de destino enxerga o proxy, e não o cliente que originou a comunicação.

> [Atenção] Proxy designa principalmente uma função de intermediação, podendo ser implementada por software ou por equipamento dedicado.
> [Bizu] Pense no proxy como um "procurador": age em nome de alguém, como intermediário entre cliente e servidor.

REGRA OBRIGATÓRIA DE COBERTURA
Recebe, para cada item, as questões reais que ele precisa cobrir. O texto deve conter, de forma explícita e correta e SEM ficar longo, o conhecimento necessário para justificar o gabarito de CADA questão listada. Se uma pegadinha das questões importar, resolva-a em um [Atenção] curto ou em uma frase, não em vários parágrafos. Se uma questão exigir um fato que não cabe neste item, diga o essencial em uma frase. Não cite números de questão nem escreva "gabarito".

QUALIDADE
- Só afirme fatos técnicos de que tenha certeza. Se houver dúvida, omita ou marque com [VERIFICAR]. Não invente normas, versões, números ou siglas.
- Nunca afirme o que uma banca já cobrou, decidiu ou considerou (ex.: "a FGV já considerou…"). Não cite bancas.
- Siga as orientações do professor quando houver; elas têm prioridade.
- Retorne somente o texto do item, sem introdução nem despedida.
- Quadro "Essencial de Prova" (quando pedido): resumo sintético dos pontos mais cobrados do tópico, em linhas curtas iniciadas por "- ", cada uma com no máximo cerca de 20 palavras. O quadro precisa caber em uma página.`;

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
    partes.push('TAREFA: escreva o quadro "Essencial de Prova" do tópico: de 6 a 10 linhas curtas (até cerca de 20 palavras cada), os pontos que mais caem em prova neste tópico, com base no sumário e nas questões abaixo. Não repita títulos.');
  } else if (b.no.temFilhos) {
    partes.push('TAREFA: este item tem sub-itens que serão escritos depois. Escreva apenas 1 ou 2 frases de abertura; não aprofunde o que pertence aos sub-itens.');
  } else {
    partes.push('TAREFA: escreva a teoria completa deste item de forma curta (em geral 100 a 220 palavras), cobrindo as questões abaixo.');
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
    max_tokens: 2500,
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
  const simular = req.query && req.query.simular;
  if (!simular && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Vercel.' });
  try {
    const b = await readBody(req);
    if (!b || !b.aulaId || !b.topico || !b.no || !b.no.nome) return res.status(400).json({ error: 'Pedido inválido' });
    const questoes = questoesDoTopico(b.aulaId, b.topico, (b.topicoIdx || 1) - 1);
    const pedido = montarPedido(b, questoes);
    if (simular) {
      // Mostra exatamente o que seria enviado, sem chamar a IA e sem custo.
      return res.status(200).json({ modelo: MODELO, sistema: SISTEMA, pedido, caracteres: SISTEMA.length + pedido.length, tokensAprox: Math.round((SISTEMA.length + pedido.length) / 3.6) });
    }
    const client = new Anthropic();
    const msg = await chamar(client, pedido);
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
