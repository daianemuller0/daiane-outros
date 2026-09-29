const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { redis, isAuthed, readBody } = require('./_lib');

// Modelo: claude-opus-5-5 por padrão. Para gastar menos, defina ANTHROPIC_MODEL=claude-sonnet-5-5 no Vercel.
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SISTEMA = `Você é o elaborador de teoria da TI TOTAL, curso de preparação para concursos de TI. Escreve o texto teórico de uma aula, um item do sumário por vez, em português do Brasil. Você escreve APENAS o conteúdo: a formatação do Word (fontes, estilos, faixas, quadros) é aplicada depois pelo sistema.

PRINCÍPIO CENTRAL: TEXTO CURTO E DE LEITURA RÁPIDA
A teoria TI TOTAL é enxuta: uma aula inteira tem cerca de 3.500 palavras. Em poucos segundos o aluno precisa entender o conceito. Não coloque tudo o que se sabe sobre o assunto: detalhes e pegadinhas entram só quando ajudam em prova. Densidade demais faz um conceito simples parecer complicado.

TAMANHO E FORMA POR TIPO DE ITEM (o pedido informa o tipo)
1. ABERTURA DO TÓPICO: 2 ou 3 parágrafos curtos (60 a 90 palavras no total): o que é o tema, sua importância ou evolução; termina com uma linha [figura].
2. ITEM COM SUB-ITENS: só 1 ou 2 frases (20 a 40 palavras) que apresentam o assunto e como ele se divide. Não aprofunde o que pertence aos sub-itens.
3. ITEM FOLHA SIMPLES (a maioria): UMA frase de definição, com o termo em **negrito** e o núcleo conceitual em {{az:azul}}, mais no máximo mais uma ou duas frases de complemento (20 a 60 palavras no total). Sem lista, sem quadro.
4. ITEM FOLHA CONCEITUAL (conceitos centrais, ou quando as questões exigem): definição + no máximo mais 1 ou 2 parágrafos curtos, uma linha de fluxo em negrito quando houver (ex.: **Cliente → Proxy → Servidor de destino**), [figura] se um esquema ajudar, e uma lista "Suas principais características são:" com 3 a 6 marcadores. Até 180 palavras.
Nunca passe de 250 palavras num item. Comece sempre direto pela definição: sem contextualização, sem repetir o título.

RECURSOS (o sistema converte para o Word)
- **negrito**: o termo definido, rótulos de lista e propriedades do conceito.
- {{az:texto}}: NEGRITO AZUL = núcleo conceitual (o que é): a definição direta, poucas palavras. Só o núcleo.
- {{vm:texto}}: NEGRITO VERMELHO = negação conceitual (o que NÃO é): ausência de propriedade, exclusão, armadilha, limite. Nunca use azul ou vermelho só para destacar, nem em frases inteiras.
- Lista com marcadores: linhas "- **Rótulo:** frase curta (até 20 palavras)." Usada em "Suas principais características são:".
- Barra lateral: linhas "> [Barra] texto". Use para enumerar TIPOS, CLASSIFICAÇÕES ou EXEMPLOS: a primeira linha é a frase de abertura ("Podem ser classificados quanto a…:") e as seguintes são "> [Barra] **Tipo:** descrição curta".
- Atenção: "> [Atenção] frase" (1 a 3 linhas, uma frase cada) só onde há risco real de confusão: não são sinônimos, exceções, limites do conceito. Bizu: "> [Bizu] frase" para memorização curta. Não use [Exemplificando], [Dica] nem [Esclarecendo] a menos que o professor peça.
- Fluxos: uma linha em negrito com setas (→). Figura: uma linha só com [figura] (o esquema é desenhado depois).
- Tabela Markdown só para comparar conceitos próximos e apenas quando as questões pedirem a comparação.
- Sem títulos (#): o sistema já coloca o título. Sem esquemas, mapas mentais, questões, resoluções ou gabaritos.

TRECHOS DO PADRÃO DESEJADO (só para o ESTILO e a extensão; não copie o conteúdo para outros itens)

[Abertura do tópico Firewall]
O firewall é um dos principais mecanismos de proteção de redes e sistemas, atuando como uma barreira de segurança entre diferentes ambientes. Dependendo de sua implementação, pode proteger desde um único computador até uma rede inteira, além de oferecer recursos de inspeção, monitoramento e controle de aplicações.

Ao longo do tempo, os firewalls evoluíram de mecanismos simples de filtragem de pacotes para soluções mais avançadas, capazes de analisar conexões, aplicações e conteúdo.

[figura]

[Item com sub-itens: Tipos de Firewall]
Os firewalls podem ser classificados de diferentes maneiras, considerando a forma de funcionamento, o local onde são implementados e os recursos de segurança oferecidos.

[Itens folha simples]
O **antiransomware** é um software de segurança destinado a {{az:detectar, bloquear e impedir ações de ransomware}}, que são programas maliciosos projetados para sequestrar ou criptografar arquivos e exigir um pagamento para restaurar o acesso aos dados.

O **firewall baseado em host** tem o objetivo de {{az:proteger um dispositivo específico}}.

**Firewall de borda ou perímetro** é um mecanismo de segurança {{az:posicionado na fronteira entre redes}} ou ambientes com diferentes níveis de confiança, normalmente entre a rede interna e a Internet.

**Zona desmilitarizada (DMZ)** é {{az:uma rede que fica entre a rede interna}}, que deve ser protegida, {{az:e a rede externa}}. Serve como uma camada adicional de segurança de rede.

**Internet → Firewall → DMZ → Firewall → Rede interna**

[figura]

[Item folha conceitual: Conceito de Proxy]
O **proxy** é um {{az:servidor intermediário}} que recebe requisições de um cliente e as encaminha para outro servidor, como um servidor web.

Dessa forma, o cliente {{vm:não se comunica diretamente com o destino}}, permitindo controlar, filtrar e monitorar o tráfego.

Seu funcionamento básico pode ser representado como:

**Cliente → Proxy → Servidor de destino**

[figura]

Suas principais características são:

- **Intermediação de conexões:** O proxy atua como um intermediário entre o cliente e o servidor de destino.
- **Controle de acesso:** Pode permitir ou bloquear o acesso a determinados sites, endereços, portas ou conteúdos, de acordo com políticas definidas pelo administrador.
- **Monitoramento e registro:** Mantém logs das conexões e dos acessos realizados.
- **Cache:** Um proxy pode armazenar temporariamente conteúdos frequentemente acessados, reduzindo o tráfego e o tempo de resposta.

[Item com classificação em Barra lateral: Antivírus]
O **antivírus** é um software de segurança que {{az:detecta, previne e remove códigos maliciosos}} de dispositivos e sistemas.

Suas principais características são:

- **Detecção:** Identifica arquivos, programas ou comportamentos associados a códigos maliciosos.
- **Proteção em tempo real:** Monitora continuamente arquivos, downloads e atividades do sistema, podendo bloquear uma ameaça antes ou durante sua execução.

> [Barra] Quanto ao método de detecção, os antivírus geralmente utilizam:
> [Barra] **Assinatura (primeira geração)**: scanner simples que usa a assinatura dos vírus para identificá-los. Limitado a vírus conhecidos.
> [Barra] **Heurística (segunda geração)**: baseia-se nas estruturas, instruções e características do código malicioso.
> [Barra] **Comportamento (terceira geração)**: baseia-se no comportamento apresentado pelo código malicioso quando executado.

**Antivírus e antimalware** {{vm:não são ferramentas excludentes ou concorrentes.}}

[Item com Atenção: Conceito de firewall]
O **firewall** é um mecanismo de segurança que {{az:controla e filtra o tráfego de uma rede ou dispositivo}}, com base em regras de segurança previamente definidas.

Ele consiste em uma solução de hardware, software ou combinação de ambos, posicionada de forma estratégica para aplicar uma política de segurança às comunicações que passam por ela.

> [Atenção] Proxy {{vm:não é sinônimo}} de firewall.
> [Atenção] O firewall tem o foco em segurança e filtragem de ameaças, enquanto o proxy foca em intermediação, cache e controle de uso.

REGRA OBRIGATÓRIA DE COBERTURA
Recebe, para cada item, as questões reais que ele precisa cobrir. O texto deve conter, de forma explícita e correta e SEM ficar longo, o conhecimento necessário para justificar o gabarito de CADA questão listada. Se uma pegadinha das questões importar, resolva-a em um [Atenção] curto ou em uma frase, não em vários parágrafos. Não cite números de questão nem escreva "gabarito".

QUALIDADE
- Só afirme fatos técnicos de que tenha certeza. Se houver dúvida, omita ou marque com [VERIFICAR]. Não invente normas, versões, números ou siglas.
- Nunca afirme o que uma banca já cobrou, decidiu ou considerou. Não cite bancas.
- Siga as orientações do professor quando houver; elas têm prioridade.
- Retorne somente o texto do item, sem introdução nem despedida.
- Quadro "Essencial de Prova" (quando pedido): resumo sintético dos pontos mais cobrados do tópico, em linhas curtas iniciadas por "- ", cada uma com no máximo cerca de 20 palavras. Deve caber em uma página.`;

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
    partes.push('TIPO: quadro "Essencial de Prova". Escreva de 6 a 10 linhas curtas (até cerca de 20 palavras cada), iniciadas por "- ", com os pontos que mais caem em prova neste tópico, com base no sumário e nas questões abaixo. Não repita títulos.');
  } else if (b.tipo === 'abertura') {
    partes.push('TIPO: ABERTURA DO TÓPICO. Escreva 2 ou 3 parágrafos curtos (60 a 90 palavras no total) que apresentem o tema do tópico, sua importância ou evolução, e terminem com uma linha [figura]. Não defina cada item do sumário.');
  } else if (b.no.temFilhos) {
    partes.push('TIPO: ITEM COM SUB-ITENS (os sub-itens são escritos depois). Escreva só 1 ou 2 frases (20 a 40 palavras) que apresentem o assunto e como ele se divide.');
  } else {
    partes.push('TIPO: ITEM FOLHA' + (b.no.nivel ? ' (nível ' + b.no.nivel + ')' : '') + '. Decida entre "simples" (uma frase de definição com o núcleo em azul, 20 a 60 palavras) e "conceitual" (definição, fluxo/[figura] e lista de características, até 180 palavras), conforme a importância do item e as questões abaixo. Prefira o simples sempre que as questões permitirem.');
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
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
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
