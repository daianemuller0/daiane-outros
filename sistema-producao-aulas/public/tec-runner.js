// TI TOTAL — criação dos cadernos no TEC Concursos (etapa 1.3).
// Roda no console da aba do TEC (logada). A configuração vem em window.__TTPA_CFG (gerada pelo sistema).
// Baseado no runbook do handoff (SI02/FD07): bancas FCC=3, CEBRASPE=4, FGV=5, VUNESP=6; filtros de pasta-favoritas;
// criação via view-model da página /questoes/filtrar; mover com /cadernos/multiple-set; total pelo gabarito; link /s/CODIGO.
(async function () {
  const CFG = window.__TTPA_CFG;
  const L = (...a) => console.log('%c[TI TOTAL]', 'color:#0E57C4;font-weight:bold', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!CFG || !CFG.codigo) { L('Configuração ausente. Copie o script de novo pelo sistema.'); return; }
  const BANCAS = {
    4: { id: 4, nome: 'CEBRASPE (CESPE)', sigla: 'CEBRASPE (CESPE)', url: 'cebraspe', rot: 'CEBRASPE' },
    3: { id: 3, nome: 'FCC', sigla: 'FCC', url: 'fcc', rot: 'FCC' },
    5: { id: 5, nome: 'FGV', sigla: 'FGV', url: 'fgv', rot: 'FGV' },
    6: { id: 6, nome: 'VUNESP', sigla: 'VUNESP', url: 'vunesp', rot: 'VUNESP' },
    7: { id: 7, nome: 'CESGRANRIO', sigla: 'CESGRANRIO', url: 'cesgranrio', rot: 'CESGRANRIO' }, // id real resolvido abaixo
  };
  const MODO = CFG.modo === 'criar' ? 'criar' : CFG.modo === 'verificar' ? 'verificar' : 'simular';
  const KEY = 'ttpa_tec_' + CFG.codigo;
  const salvo = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const grava = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };

  // ---- requisições (com espera automática no limite 429 do TEC) ----
  async function req(method, path, body, form) {
    for (let t = 0; t < 4; t++) {
      const opt = { method, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
      if (body !== undefined) {
        if (form) { opt.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; opt.body = body; }
        else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
      }
      const r = await fetch(path, opt);
      if (r.status === 429) { L('Limite do TEC (429). Aguardando 70 segundos…'); await sleep(70000); continue; }
      let d = null; try { d = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, d };
    }
    return { ok: false, status: 429, d: null };
  }
  // conta questões (uma página de até ~100 ids: serve para saber se a banca tem questão)
  async function CNT(filtros) {
    const pairs = [['formato', 'OBJETIVA'], ['universo', ''], ['pagina', '']];
    filtros.forEach((f, i) => { pairs.push(['filtros[' + i + '].id', f.id], ['filtros[' + i + '].tipo', f.tipo]); });
    const body = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    const r = await req('POST', '/api/questoes/filtros', body, true);
    await sleep(1200);
    return r.ok && r.d && r.d.questoes ? r.d.questoes.length : -1;
  }

  // total EXATO de questões de um filtro (pagina até acabar). Devolve null se a paginação do TEC não for confiável.
  async function CNTX(filtros) {
    const pairs0 = [['formato', 'OBJETIVA'], ['universo', '']];
    filtros.forEach((f, i) => { pairs0.push(['filtros[' + i + '].id', f.id], ['filtros[' + i + '].tipo', f.tipo]); });
    const pagina = async (pg) => {
      const pairs = pairs0.concat([['pagina', pg]]);
      const body = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      const r1 = await req('POST', '/api/questoes/filtros', body, true); await sleep(1200);
      return r1.ok && r1.d && Array.isArray(r1.d.questoes) ? r1.d.questoes : null;
    };
    const p1 = await pagina(''); if (!p1) return null;
    if (p1.length < 100) return p1.length;
    let total = p1.length; const vistos = new Set(p1.map((q) => JSON.stringify(q)));
    for (let pg = 2; pg <= 40; pg++) {
      const pp = await pagina(String(pg)); if (!pp) return null;
      if (!pp.length) return total;
      if (pp.every((q) => vistos.has(JSON.stringify(q)))) return null;   // paginação não funcionou
      pp.forEach((q) => vistos.add(JSON.stringify(q))); total += pp.length;
    }
    return null;
  }

  // ---- cadernos que JÁ existem no TEC (nunca criar de novo) ----
  const nn = (s) => norm(s).replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  // chave do caderno: tópico (nº) ou geral/integradas + banca. Assim o nome do tópico pode estar abreviado no TEC.
  function chave(nome) {
    const n = nn(nome).replace(new RegExp('^ti total - ' + nn(CFG.codigo) + ' - '), '');
    const b = /\((cebraspe(?: \(cespe\))?|fcc|fgv|vunesp|cesgranrio)\)\s*$/.exec(n); const banca = b ? b[1].replace(/ \(cespe\)/, '') : '';
    if (/^geral da aula/.test(n)) return 'geral|' + banca;
    if (/^questoes integradas/.test(n)) return 'integradas|' + banca;
    const m = /^(\d+)\s*-/.exec(n); return m ? 't' + m[1] + '|' + banca : 'outro|' + n;
  }
  async function listaExistentes() {
    const out = new Map(); const pref = nn('TI TOTAL - ' + CFG.codigo + ' - ');
    const add = (id, nome) => { if (id != null && typeof nome === 'string' && nn(nome).startsWith(pref)) out.set(nn(nome), { id: String(id), nome: nome.trim() }); };
    const varre = (o, d, vistos) => {
      if (!o || typeof o !== 'object' || d > 6 || vistos.has(o)) return; vistos.add(o);
      if (!Array.isArray(o)) { const nome = o.nome || o.titulo || o.nomeCaderno; if (o.id != null && nome) add(o.id, nome); }
      for (const k of Object.keys(o)) varre(o[k], d + 1, vistos);
    };
    const dest = String(CFG.pastaDestino || '').replace(/\D/g, '');
    const urls = [];
    if (dest) urls.push('/api/pastas/' + dest + '/cadernos', '/api/pastas/' + dest, '/api/cadernos?pasta=' + dest, '/api/pastas/' + dest + '/conteudo');
    urls.push('/api/cadernos', '/api/pastas-cadernos', '/api/cadernos/recentes');
    for (const u of urls) { try { const r1 = await req('GET', u); if (r1.ok && r1.d) varre(r1.d, 0, new Set()); } catch (e) {} await sleep(300); }
    const doms = [];
    if (/\/questoes\/pastas\//.test(location.pathname)) doms.push(document);
    if (dest) { try { const h = await fetch('/questoes/pastas/' + dest, { credentials: 'include' }); if (h.ok) doms.push(new DOMParser().parseFromString(await h.text(), 'text/html')); } catch (e) {} }
    for (const dm of doms) dm.querySelectorAll('a[href*="/cadernos/"]').forEach((a) => { const m = /\/cadernos\/(\d+)/.exec(a.getAttribute('href') || ''); if (m) add(m[1], a.textContent); });
    // cadernos que o sistema já conhece (resultado importado): valem mesmo se a listagem do TEC não os mostrar
    (CFG.jaExistem || []).forEach((c) => add(c.id, c.nome));
    return out;
  }

  try {
    L('Modo:', MODO === 'criar' ? 'CRIAÇÃO' : MODO === 'verificar' ? 'VERIFICAÇÃO (só lê, não cria)' : 'SIMULAÇÃO (não cria nada)', '· aula', CFG.codigo);
    // ---- 1) pastas-favoritas de cada tópico ----
    const pr = await req('GET', '/api/pastas-favoritas');
    const pastas = (pr.d && pr.d.pastas) || [];
    if (!pastas.length) { L('Não consegui listar as pastas de favoritas. Confirme que está logada no TEC.'); return; }
    const reCod = new RegExp('^\\s*' + CFG.codigo + '\\D*?(\\d+)', 'i');
    const topicos = CFG.topicos.map((t) => {
      let p = CFG.pastasFav && CFG.pastasFav[t.n] ? pastas.find((x) => String(x.id) === String(CFG.pastasFav[t.n])) : null;
      if (!p) p = pastas.find((x) => { const m = reCod.exec(x.nome || ''); return m && Number(m[1]) === t.n; });
      if (!p) p = pastas.find((x) => norm(x.nome).includes(norm(t.nome).slice(0, 14)));
      return { ...t, pasta: p || null };
    });
    console.table(topicos.map((t) => ({ tópico: t.n + ' ' + t.nome, pasta: t.pasta ? t.pasta.nome + ' (' + t.pasta.id + ')' : '— NÃO ENCONTRADA —' })));
    if (topicos.some((t) => !t.pasta)) { L('Alguma pasta de favoritas não foi encontrada. No sistema, informe o ID dela e copie o script de novo.'); return; }
    const favIds = topicos.map((t) => String(t.pasta.id));
    let bancas = (CFG.bancas || [4, 3, 5]).filter((b) => BANCAS[b]);
    if (bancas.includes(7)) {
      // CESGRANRIO: id informado no sistema ou detectado na página do TEC
      let idc = String(CFG.idCesgranrio || '').replace(/\D/g, '');
      if (!idc) {
        try {
          const root = angular.element(document.querySelector('.ng-scope')).scope();
          const vm = root && (root.vm || root.$ctrl || root);
          const vistos = new Set();
          const busca = (o, d) => {
            if (!o || typeof o !== 'object' || d > 4 || vistos.has(o)) return null; vistos.add(o);
            if (!Array.isArray(o) && typeof o.nome === 'string' && /cesgranrio/i.test(o.nome) && o.id != null) return o.id;
            for (const k of Object.keys(o)) { if (k[0] === '$') continue; let r; try { r = busca(o[k], d + 1); } catch (e) { r = null; } if (r != null) return r; }
            return null;
          };
          const f = busca(vm, 0); if (f != null) idc = String(f);
        } catch (e) {}
      }
      if (idc) { BANCAS[idc] = Object.assign({}, BANCAS[7], { id: Number(idc) }); bancas = bancas.map((b) => (b === 7 ? Number(idc) : b)); L('CESGRANRIO = banca', idc); }
      else { bancas = bancas.filter((b) => b !== 7); L('CESGRANRIO ignorada: não achei o código da banca no TEC. Informe no sistema (campo CESGRANRIO) e copie o script de novo.'); }
    }

    // ---- 2) plano (só bancas com questões) ----
    const plano = [];
    const mk = (nome, fav, banca, rotulo) => ({ nome, favIds: fav, bancaId: banca, rotulo });
    const LIMPEZA = CFG.limpeza === false ? [] : [{ id: 'REMOVER_ANULADAS', nome: 'Remover questões anuladas' }, { id: 'REMOVER_DESATUALIZADAS', nome: 'Remover questões desatualizadas' }];
    const filtroDe = (fav, banca) => fav.map((id) => ({ id, tipo: 'PASTA_FAVORITAS' })).concat(banca ? [{ id: String(banca), tipo: 'BANCA' }] : []).concat(LIMPEZA.map((f) => ({ id: f.id, tipo: 'FILTRO_QUESTAO' })));
    for (const t of topicos) {
      const fav = [String(t.pasta.id)];
      const base = 'TI TOTAL - ' + CFG.codigo + ' - ' + t.n + ' - ' + t.nome;
      const tot = await CNT(filtroDe(fav, null));
      if (tot === 0) { L('Tópico sem questões, ignorado:', t.nome); continue; }
      plano.push({ ...mk(base, fav, null, t.n + ' ' + t.nome + ' · geral'), qtd: tot });
      for (const b of bancas) {
        const c = await CNT(filtroDe(fav, b));
        if (c > 0) plano.push({ ...mk(base + ' (' + BANCAS[b].rot + ')', fav, b, t.n + ' ' + t.nome + ' · ' + BANCAS[b].rot), qtd: c });
        else L('Sem questões', BANCAS[b].rot, 'em', t.nome, '→ ignorado');
      }
    }
    const baseAula = 'TI TOTAL - ' + CFG.codigo + ' - Geral da aula';
    plano.push({ ...mk(baseAula, favIds, null, 'Geral da aula'), qtd: null });
    for (const b of bancas) {
      const c = await CNT(filtroDe(favIds, b));
      if (c > 0) plano.push({ ...mk(baseAula + ' (' + BANCAS[b].rot + ')', favIds, b, 'Geral da aula · ' + BANCAS[b].rot), qtd: c });
    }
    if (CFG.integradas) {
      const pi = pastas.find((x) => norm(x.nome).includes('integrad') && norm(x.nome).includes(norm(CFG.codigo)));
      if (!pi) L('Pasta de favoritas "integradas" da aula não encontrada: cadernos de integradas ignorados.');
      else for (const b of bancas) {
        const c = await CNT(filtroDe([String(pi.id)], b));
        if (c > 0) plano.push({ ...mk('TI TOTAL - ' + CFG.codigo + ' - Questões integradas (' + BANCAS[b].rot + ')', [String(pi.id)], b, 'Integradas · ' + BANCAS[b].rot), qtd: c });
      }
    }
    // ---- 2b) o que já existe no TEC ----
    const existentes = await listaExistentes();
    const porChave = new Map(); existentes.forEach((v) => { const k = chave(v.nome); if (!porChave.has(k)) porChave.set(k, []); porChave.get(k).push(v); });
    plano.forEach((p) => { const e = porChave.get(chave(p.nome)); if (e && e.length) { p.existe = e[0].id; p.existeNome = e[0].nome; } });
    const chavesPlano = new Set(plano.map((p) => chave(p.nome)));
    const sobrando = [];
    porChave.forEach((arr, k) => { if (!chavesPlano.has(k)) arr.forEach((v) => sobrando.push(v.nome + ' (fora do plano)')); else arr.slice(1).forEach((v) => sobrando.push(v.nome + ' (DUPLICADO)')); });
    const novos = plano.filter((p) => !p.existe);
    if (MODO !== 'simular') {
      L('Conferindo o total exato de cada caderno que já existe (pode levar alguns minutos)…');
      for (const p of plano) { if (!p.existe) continue; try { p.esperadoExato = await CNTX(filtroDe(p.favIds, p.bancaId)); } catch (e) { p.esperadoExato = null; } }
    }
    console.table(plano.map((p) => ({ caderno: p.nome, 'questões (1ª página)': p.qtd == null ? '—' : p.qtd, 'já existe no TEC': p.existe ? 'SIM · ' + p.existeNome : 'não' })));
    L('Já existem no TEC:', plano.length - novos.length, '· faltam criar:', novos.length, '· do plano:', plano.length);
    if (sobrando.length) L('Sobrando no TEC (confira, pode ser duplicado ou teste):', sobrando.join(' | '));
    if (!existentes.size) L('ATENÇÃO: não consegui ver nenhum caderno existente de', CFG.codigo, '. Se já criou cadernos, abra a pasta da aula (tecconcursos.com.br/questoes/pastas/ID) e rode o script nela.');
    if (MODO === 'simular') { L('SIMULAÇÃO concluída. Nada foi criado. Para criar só o que falta, copie o script de CRIAÇÃO no sistema.'); return; }
    if (MODO === 'criar' && novos.length) {
      if (!/\/questoes\/filtrar/.test(location.pathname)) { L('Abra https://www.tecconcursos.com.br/questoes/filtrar e rode de novo.'); alert('Abra a página /questoes/filtrar do TEC e rode o script de novo.'); return; }
      if (!existentes.size && !confirm('ATENÇÃO: não consegui ver os cadernos que já existem de ' + CFG.codigo + '.\nSe você já criou cadernos desta aula no TEC, CANCELE (abra a pasta da aula e rode o script lá).\nContinuar mesmo assim e criar tudo?')) { L('Cancelado por segurança (não consegui verificar os existentes).'); return; }
      if (!confirm('Já existem ' + (plano.length - novos.length) + ' cadernos. Criar os ' + novos.length + ' que faltam no TEC para ' + CFG.codigo + '?\nPode levar vários minutos. Não feche esta aba.')) { L('Cancelado.'); return; }
    } else if (MODO === 'criar') L('Todos os cadernos do plano já existem. Nada a criar; só vou conferir e gerar o resultado.');

    // ---- 3) criação (retomável: o que já foi criado fica guardado) ----
    const getVM = () => { let vm = null; document.querySelectorAll('.ng-scope').forEach((el) => { const s = angular.element(el).scope(); if (s && s.vm && s.vm.gerarCaderno) vm = s.vm; }); return vm; };
    async function aguardaVM() { for (let i = 0; i < 40; i++) { const vm = getVM(); if (vm) return vm; await sleep(500); } return null; }
    const progresso = salvo(); progresso.itens = progresso.itens || {};
    if (MODO === 'verificar') progresso.itens = {};
    for (let i = 0; i < plano.length; i++) {
      const p = plano[i];
      if (p.existe) { if (!progresso.itens[p.nome]) progresso.itens[p.nome] = { id: p.existe, rotulo: p.rotulo, existente: true }; grava(progresso); continue; }
      if (MODO === 'verificar') continue;
      if (progresso.itens[p.nome]) { L('Já criado, pulando:', p.nome); continue; }
      const vm = await aguardaVM();
      if (!vm) { L('A página não está pronta. Volte para /questoes/filtrar e rode de novo (retoma de onde parou).'); return; }
      const fm = {}, arr = [];
      p.favIds.forEach((id) => { const o = { id, nome: 'x', ultimaAlterada: false, tipo: 'PASTA_FAVORITAS', tipoDescricao: 'Favoritas' }; fm['' + id] = o; arr.push(o); });
      const filtros = { PASTA_FAVORITAS: fm };
      if (p.bancaId) { const b = Object.assign({ bancaOculta: false, tipo: 'BANCA', tipoDescricao: 'Banca' }, BANCAS[p.bancaId]); delete b.rot; filtros.BANCA = {}; filtros.BANCA['' + p.bancaId] = b; arr.push(b); }
      if (LIMPEZA.length) { const fq = {}; LIMPEZA.forEach((f) => { const o = { id: f.id, nome: f.nome, ultimaAlterada: false, tipo: 'FILTRO_QUESTAO', tipoDescricao: 'Filtro de questões' }; fq[f.id] = o; arr.push(o); }); filtros.FILTRO_QUESTAO = fq; }
      const root = angular.element(document.querySelector('.ng-scope')).scope();
      root.$apply(() => { vm.filtros = filtros; vm.arrayFiltros = arr; vm.nomeCaderno = p.nome; vm.pastaCadernosAtual = String(CFG.pastaDestino || ''); });
      vm.gerarCaderno();
      let id = null;
      for (let k = 0; k < 40 && !id; k++) { await sleep(500); const m = location.pathname.match(/\/questoes\/cadernos\/(\d+)/); if (m) id = m[1]; }
      if (!id) { L('Não consegui confirmar a criação de', p.nome, '. Parei. Confira no TEC e rode de novo.'); return; }
      progresso.itens[p.nome] = { id, rotulo: p.rotulo }; grava(progresso);
      L('Criado (' + (i + 1) + '/' + plano.length + '):', p.nome, '→', id);
      history.back();
      await sleep(6500);   // o TEC descarta criações muito rápidas
    }

    // ---- 4) mover para a pasta da aula ----
    const ids = Object.values(progresso.itens).filter((x) => !x.existente).map((x) => Number(x.id));
    if (MODO === 'verificar' || !ids.length) L('Nenhum caderno novo para mover.');
    else if (CFG.pastaDestino) {
      const TEC = angular.element(document.querySelector('.ng-scope')).injector().get('tec');
      for (let i = 0; i < ids.length; i += 20) { await TEC.apiPost('/cadernos/multiple-set', { cadernos: ids.slice(i, i + 20), pastaDestino: Number(CFG.pastaDestino), subpastaDestino: null }); await sleep(1500); }
      L('Cadernos movidos para a pasta', CFG.pastaDestino);
    } else L('Sem ID de pasta de destino: os cadernos ficaram em "Sem classificação".');

    // ---- 5) total exato (gabarito) e link de compartilhamento ----
    const resultados = [];
    for (const p of plano) {
      const it = progresso.itens[p.nome]; if (!it) continue;
      const g = await req('GET', '/api/cadernos/' + it.id + '/gabarito?pagina=1'); await sleep(1000);
      const s = await req('POST', '/api/cadernos/' + it.id + '/compartilhamento', {}); await sleep(1000);
      const link = s.d && s.d.links && s.d.links[0] ? s.d.links[0] : '';
      const total = g.d ? g.d.resultCount : null;
      const esperado = p.esperadoExato != null ? p.esperadoExato : (p.qtd != null && p.qtd < 100 ? p.qtd : null);   // exato quando a paginação do TEC funciona; senão só até 100
      resultados.push({ nome: p.nome, rotulo: p.rotulo, id: it.id, total, esperado, confere: esperado == null || total == null ? null : total === esperado, link });
    }
    console.table(resultados);
    const difere = resultados.filter((r) => r.confere === false);
    if (difere.length) {
      L('ATENÇÃO: ' + difere.length + ' caderno(s) com quantidade DIFERENTE do que o TEC devolve hoje para a mesma pasta e banca (provavelmente desatualizados):');
      difere.forEach((r) => L(' •', r.nome, '→ está com', r.total, 'mas o esperado é', r.esperado, '(id', r.id + ')'));
      L('Para corrigir: apague esses cadernos no TEC e rode o script de CRIAÇÃO (ele só cria o que faltar).');
    } else L('Nenhum caderno com quantidade diferente do esperado.');
    const semComp = resultados.filter((r) => r.confere == null).length;
    if (semComp) L(semComp, 'caderno(s) sem como comparar (sem total esperado).');
    if (MODO === 'verificar') L('VERIFICAÇÃO: existem', plano.length - novos.length, 'de', plano.length, 'cadernos do plano.', novos.length ? 'FALTAM: ' + novos.map((p) => p.nome).join(' | ') : 'Nenhum falta.');
    const out = JSON.stringify({ ttpa: 1, codigo: CFG.codigo, geradoEm: Date.now(), cadernos: resultados });
    try { if (typeof copy === 'function') copy(out); } catch (e) {}
    L('PRONTO. O resultado foi copiado. Cole na etapa 1.3 do sistema ("Colar resultado do TEC"). Se não copiou, rode: copy(window.__TTPA_RESULTADO)');
    window.__TTPA_RESULTADO = out;
  } catch (e) { L('ERRO:', e && e.message ? e.message : e); }
})();
