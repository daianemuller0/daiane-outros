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
  };
  const MODO = CFG.modo === 'criar' ? 'criar' : 'simular';
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

  try {
    L('Modo:', MODO === 'criar' ? 'CRIAÇÃO' : 'SIMULAÇÃO (não cria nada)', '· aula', CFG.codigo);
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
    const bancas = (CFG.bancas || [4, 3, 5]).filter((b) => BANCAS[b]);

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
    console.table(plano.map((p) => ({ caderno: p.nome, 'questões (1ª página)': p.qtd == null ? '—' : p.qtd })));
    L('Cadernos a criar:', plano.length, '(contagem exata vem do gabarito, depois de criar)');
    if (MODO !== 'criar') { L('SIMULAÇÃO concluída. Nada foi criado. Para criar, copie o script de CRIAÇÃO no sistema.'); return; }
    if (!/\/questoes\/filtrar/.test(location.pathname)) { L('Abra https://www.tecconcursos.com.br/questoes/filtrar e rode de novo.'); alert('Abra a página /questoes/filtrar do TEC e rode o script de novo.'); return; }
    if (!confirm('Criar ' + plano.length + ' cadernos no TEC para ' + CFG.codigo + '?\nPode levar vários minutos. Não feche esta aba.')) { L('Cancelado.'); return; }

    // ---- 3) criação (retomável: o que já foi criado fica guardado) ----
    const getVM = () => { let vm = null; document.querySelectorAll('.ng-scope').forEach((el) => { const s = angular.element(el).scope(); if (s && s.vm && s.vm.gerarCaderno) vm = s.vm; }); return vm; };
    async function aguardaVM() { for (let i = 0; i < 40; i++) { const vm = getVM(); if (vm) return vm; await sleep(500); } return null; }
    const progresso = salvo(); progresso.itens = progresso.itens || {};
    for (let i = 0; i < plano.length; i++) {
      const p = plano[i];
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
    const ids = Object.values(progresso.itens).map((x) => Number(x.id));
    if (CFG.pastaDestino) {
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
      const esperado = p.qtd != null && p.qtd < 100 ? p.qtd : null;   // a 1ª página só traz até ~100 ids: acima disso não há como comparar
      resultados.push({ nome: p.nome, rotulo: p.rotulo, id: it.id, total, esperado, confere: esperado == null || total == null ? null : total === esperado, link });
    }
    console.table(resultados);
    const difere = resultados.filter((r) => r.confere === false);
    if (difere.length) L('ATENÇÃO: contagem diferente do esperado em', difere.length, 'caderno(s):', difere.map((r) => r.nome).join(' | '));
    const out = JSON.stringify({ ttpa: 1, codigo: CFG.codigo, geradoEm: Date.now(), cadernos: resultados });
    try { if (typeof copy === 'function') copy(out); } catch (e) {}
    L('PRONTO. O resultado foi copiado. Cole na etapa 1.3 do sistema ("Colar resultado do TEC"). Se não copiou, rode: copy(window.__TTPA_RESULTADO)');
    window.__TTPA_RESULTADO = out;
  } catch (e) { L('ERRO:', e && e.message ? e.message : e); }
})();
