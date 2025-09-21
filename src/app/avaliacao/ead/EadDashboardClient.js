'use client';

import { useState, useMemo, useEffect } from 'react';

import EadFilters from '../avalia/components/EadFilters';
import ActivityChart from '../avalia/components/ActivityChart';
import styles from '../../../styles/dados.module.css';
import { questionMapEad } from '../../avaliacao/lib/questionMappingEad';
import StatCard from '../avalia/components/StatCard';
import { Users, TrendingUp, TrendingDown } from 'lucide-react';
import BoxplotChart from '../avalia/components/BoxplotChart';

// ---------------- Utils ----------------
function truncateText(text, maxLength = 20) {
  if (typeof text !== 'string' || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
const CONCEITOS = ['Excelente', 'Bom', 'Regular', 'Insuficiente'];
const NUM_TO_CONCEITO_2023 = { 1: 'Insuficiente', 2: 'Regular', 3: 'Bom', 4: 'Excelente' };

function sanitizeList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(v => (typeof v === 'string' ? v.trim() : v))
    .filter(v => v && v !== 'todos' && !(typeof v === 'string' && /^qual\b/i.test(v)));
}

function getQHeadersFromRows2023(rows) {
  if (!rows || !rows.length) return [];
  const any = rows.find(r => r && typeof r === 'object') || {};
  const nums = Object.keys(any)
    .map(k => {
      const m = /^(\d+)\)/.exec(k);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(Boolean);
  const max = nums.length ? Math.max(...nums) : 45;
  return Array.from({ length: max }, (_, i) => `${i + 1})`);
}

/* ============ helpers para boxplot (Apex) ============ */
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * IMPORTANTE:
 *  - para itens (1..13, etc) usaremos x numérico (Number) p/ garantir alinhamento dos boxes com o eixo.
 *  - para rótulos textuais (dimensões) x segue string.
 */
function buildApexBoxplotFromValues(label, values, forceNumericX = false) {
  const v = (values || []).filter(n => Number.isFinite(n));
  if (!v.length) {
    return {
      boxplot_data: [{ x: forceNumericX ? Number(label) : label, y: [0, 0, 0, 0, 0] }],
      outliers_data: []
    };
  }

  const s = [...v].sort((a, b) => a - b);

  // percentis
  const q1_raw = percentile(s, 0.25);
  const med_raw = percentile(s, 0.5);
  const q3_raw = percentile(s, 0.75);

  // whiskers por fence clássica
  const iqr_raw = q3_raw - q1_raw;
  const lowerFence = q1_raw - 1.5 * iqr_raw;
  const upperFence = q3_raw + 1.5 * iqr_raw;

  const inliers = s.filter(x => x >= lowerFence && x <= upperFence);
  let whiskerMin = inliers.length ? Math.min(...inliers) : s[0];
  let whiskerMax = inliers.length ? Math.max(...inliers) : s[s.length - 1];

  // --- altura mínima do box (quando Q1≈Q3≈Mediana) ---
  const EPS = 0.06;
  let q1 = q1_raw;
  let med = med_raw;
  let q3 = q3_raw;

  if (q3 - q1 < EPS) {
    q1 = Math.max(1.0, med_raw - EPS / 2);
    q3 = Math.min(4.0, med_raw + EPS / 2);
    whiskerMin = Math.min(whiskerMin, q1);
    whiskerMax = Math.max(whiskerMax, q3);
  }

  whiskerMin = Math.max(1.0, Math.min(whiskerMin, 4.0));
  whiskerMax = Math.max(1.0, Math.min(whiskerMax, 4.0));
  q1 = Math.max(1.0, Math.min(q1, 4.0));
  med = Math.max(1.0, Math.min(med, 4.0));
  q3 = Math.max(1.0, Math.min(q3, 4.0));

  const outliers = s.filter(x => x < whiskerMin || x > whiskerMax);

  const xLabel = forceNumericX ? Number(label) : label;

  return {
    boxplot_data: [{ x: xLabel, y: [whiskerMin, q1, med, q3, whiskerMax] }],
    outliers_data: outliers.map(val => ({ x: xLabel, y: val }))
  };
}

/* ========= helper para quebrar labels longas ========= */
function wrapWords(label, maxLen = 18) {
  if (!label) return [''];
  const words = String(label).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (tryLine.length > maxLen) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}
const wrapForApex = (label) => wrapWords(label).join('\n');

/* ---------- Formatação para os gráficos ---------- */
function formatProporcoesChartData(apiData) {
  if (!apiData || !apiData.length) return { labels: [], datasets: [] };
  const labels = [...new Set(apiData.map(item => item.dimensao))];
  const colorMap = { Excelente: '#1D556F', Bom: '#288FB4', Regular: '#F0B775', Insuficiente: '#FA360A' };
  const datasets = CONCEITOS.map(conceito => ({
    label: conceito,
    data: labels.map(label => {
      const item = apiData.find(d => d.dimensao === label && d.conceito === conceito);
      return item ? item.valor : 0;
    }),
    backgroundColor: colorMap[conceito]
  }));
  return { labels, datasets };
}

function formatProporcoesItensChartData(apiData) {
  if (!apiData || !apiData.length) return { labels: [], datasets: [] };
  const labels = [...new Set(apiData.map(item => item.item))].sort((a, b) => parseInt(a) - parseInt(b));
  const colorMap = { Excelente: '#1D556F', Bom: '#288FB4', Regular: '#F0B775', Insuficiente: '#FA360A' };
  const datasets = CONCEITOS.map(conceito => ({
    label: conceito,
    data: labels.map(label => {
      const item = apiData.find(d => d.item === label && d.conceito === conceito);
      return item ? item.valor : 0;
    }),
    backgroundColor: colorMap[conceito]
  }));
  return { labels, datasets };
}

const round2 = (n) => (Number.isFinite(n) ? Number(n.toFixed(2)) : n);

/* ---------- Reagregadores ---------- */
function aggregateFromRows2025(rows, qHeadersFull) {
  const headers = Array.isArray(qHeadersFull) && qHeadersFull.length ? qHeadersFull : [];

  const toScoreKey = (ans) => {
    if (!ans) return null;
    const a = String(ans).trim();
    if (a.startsWith('Excelente')) return 'Excelente';
    if (a.startsWith('Bom'))       return 'Bom';
    if (a.startsWith('Regular'))   return 'Regular';
    if (a.startsWith('Insuficiente')) return 'Insuficiente';
    if (/^n(ã|a)o se aplica/i.test(a)) return null;
    return null;
  };
  const toScoreVal = (ans) => {
    if (!ans) return null;
    const a = String(ans).trim();
    if (a.startsWith('Excelente')) return 4;
    if (a.startsWith('Bom'))       return 3;
    if (a.startsWith('Regular'))   return 2;
    if (a.startsWith('Insuficiente')) return 1;
    if (/^n(ã|a)o se aplica/i.test(a)) return null;
    return null;
  };

  const dims = {
    'Autoavaliação Discente': headers.slice(0, 13),
    'Avaliação da Ação Docente': headers.slice(13, 35),
    'Instalações Físicas e Recursos de TI': headers.slice(35, 45)
  };

  const dimensoes = [];
  Object.entries(dims).forEach(([dim, hs]) => {
    const counts = { Excelente: 0, Bom: 0, Regular: 0, Insuficiente: 0 };
    let total = 0;
    rows.forEach(r => {
      hs.forEach(h => {
        const c = toScoreKey(r[h]);
        if (c) { counts[c]++; total++; }
      });
    });
    CONCEITOS.forEach(c => dimensoes.push({
      dimensao: dim, conceito: c, valor: total ? (counts[c] / total) * 100 : 0
    }));
  });

  // Médias por Dimensão e boxplot por dimensão
  const mediasPorDim = [];
  const boxplotDimRaw = [];
  Object.entries(dims).forEach(([dim, hs]) => {
    let sum = 0, count = 0;
    const perRespondent = [];
    rows.forEach(r => {
      const vals = hs.map(h => toScoreVal(r[h])).filter(v => v != null);
      if (vals.length) {
        const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
        perRespondent.push(avg);
        sum += vals.reduce((a,b)=>a+b,0);
        count += vals.length;
      }
    });
    mediasPorDim.push({ dimensao: dim, media: count ? sum / count : 0 });
    boxplotDimRaw.push({ dimensao: dim, values: perRespondent });
  });

  // ---- Médias por item e boxplot por item (Autoavaliação) ----
  const mediasItensAuto = [];
  const boxplotItensAutoRaw = [];
  dims['Autoavaliação Discente'].forEach((h, idx) => {
    const vals = rows.map(r => toScoreVal(r[h])).filter(v => v != null);
    const media = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    const item = String(idx + 1);
    mediasItensAuto.push({ item, media });
    boxplotItensAutoRaw.push({ item, values: vals });
  });

  // ---- Médias por item para as demais dimensões (NOVO) ----
  const mediasForHeaders = (hs, offset) => hs.map((h, idx) => {
    const vals = rows.map(r => toScoreVal(r[h])).filter(v => v != null);
    const media = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    return { item: String(offset + idx + 1), media };
  });

  const mediasItensAtitude   = mediasForHeaders(headers.slice(13, 19), 13);
  const mediasItensGestao    = mediasForHeaders(headers.slice(19, 30), 19);
  const mediasItensProcesso  = mediasForHeaders(headers.slice(30, 35), 30);
  const mediasItensInfra     = mediasForHeaders(headers.slice(35, 45), 35);

  const makeItens = (hs, offset = 0) => hs.flatMap((h, idx) => {
    const counts = { Excelente: 0, Bom: 0, Regular: 0, Insuficiente: 0 };
    let total = 0;
    rows.forEach(r => {
      const c = toScoreKey(r[h]);
      if (c) { counts[c]++; total++; }
    });
    const item = String(offset + idx + 1);
    return CONCEITOS.map(c => ({
      item, conceito: c, valor: total ? (counts[c] / total) * 100 : 0
    }));
  });

  return {
    dimensoes,
    mediasPorDim,
    boxplotDimRaw,

    mediasItensAuto,
    boxplotItensAutoRaw,

    mediasItensAtitude,
    mediasItensGestao,
    mediasItensProcesso,
    mediasItensInfra,

    autoavaliacaoItens: makeItens(dims['Autoavaliação Discente'], 0),
    acaoDocenteAtitude: makeItens(headers.slice(13, 19), 13),
    acaoDocenteGestao:   makeItens(headers.slice(19, 30), 19),
    acaoDocenteProcesso: makeItens(headers.slice(30, 35), 30),
    infraestruturaItens: makeItens(dims['Instalações Físicas e Recursos de TI'], 35)
  };
}

function aggregateFromRows2023(rows, qHeaders) {
  const toKey = (n) => NUM_TO_CONCEITO_2023[n] ?? null;
  const toVal = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 5) return null;
    return v;
  };

  const endAuto = Math.min(13, qHeaders.length);
  const endAcao = Math.min(35, qHeaders.length);
  const endInfra = Math.min(43, qHeaders.length);

  const dims = {
    'Autoavaliação Discente': qHeaders.slice(0, endAuto),
    'Avaliação da Ação Docente': qHeaders.slice(13, endAcao),
    'Instalações Físicas e Recursos de TI': qHeaders.slice(35, endInfra)
  };

  const dimensoes = [];
  Object.entries(dims).forEach(([dim, hs]) => {
    const counts = { Excelente: 0, Bom: 0, Regular: 0, Insuficiente: 0 };
    let total = 0;
    rows.forEach(r => {
      hs.forEach(h => {
        const c = toKey(Number(r[h]));
        if (c) { counts[c]++; total++; }
      });
    });
    CONCEITOS.forEach(c => dimensoes.push({
      dimensao: dim, conceito: c, valor: total ? (counts[c] / total) * 100 : 0
    }));
  });

  const mediasPorDim = [];
  const boxplotDimRaw = [];
  Object.entries(dims).forEach(([dim, hs]) => {
    let sum = 0, count = 0;
    const perRespondent = [];
    rows.forEach(r => {
      const vals = hs.map(h => toVal(r[h])).filter(v => v != null);
      if (vals.length) {
        const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
        perRespondent.push(avg);
        sum += vals.reduce((a,b)=>a+b,0);
        count += vals.length;
      }
    });
    mediasPorDim.push({ dimensao: dim, media: count ? sum / count : 0 });
    boxplotDimRaw.push({ dimensao: dim, values: perRespondent });
  });

  // Auto
  const mediasItensAuto = [];
  const boxplotItensAutoRaw = [];
  dims['Autoavaliação Discente'].forEach(h => {
    const vals = rows.map(r => toVal(r[h])).filter(v => v != null);
    const media = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    const item = h.replace(')', '');
    mediasItensAuto.push({ item, media });
    boxplotItensAutoRaw.push({ item, values: vals });
  });

  // Demais dimensões (NOVO)
  const mediasForHeaders = (hs) => hs.map((h) => {
    const vals = rows.map(r => toVal(r[h])).filter(v => v != null);
    const media = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    return { item: h.replace(')', ''), media };
  });

  const mediasItensAtitude   = mediasForHeaders(qHeaders.slice(13, Math.min(19, qHeaders.length)));
  const mediasItensGestao    = mediasForHeaders(qHeaders.slice(19, Math.min(30, qHeaders.length)));
  const mediasItensProcesso  = mediasForHeaders(qHeaders.slice(30, Math.min(35, qHeaders.length)));
  const mediasItensInfra     = mediasForHeaders(qHeaders.slice(35, Math.min(43, qHeaders.length)));

  const makeItens = (hs) => hs.flatMap(h => {
    const counts = { Excelente: 0, Bom: 0, Regular: 0, Insuficiente: 0 };
    let total = 0;
    rows.forEach(r => {
      const c = toKey(Number(r[h]));
      if (c) { counts[c]++; total++; }
    });
    const item = h.replace(')', '');
    return CONCEITOS.map(c => ({
      item, conceito: c, valor: total ? (counts[c] / total) * 100 : 0
    }));
  });

  return {
    dimensoes,
    mediasPorDim,
    boxplotDimRaw,

    mediasItensAuto,
    boxplotItensAutoRaw,

    mediasItensAtitude,
    mediasItensGestao,
    mediasItensProcesso,
    mediasItensInfra,

    autoavaliacaoItens: makeItens(dims['Autoavaliação Discente']),
    acaoDocenteAtitude: makeItens(qHeaders.slice(13, Math.min(19, qHeaders.length))),
    acaoDocenteGestao:   makeItens(qHeaders.slice(19, Math.min(30, qHeaders.length))),
    acaoDocenteProcesso: makeItens(qHeaders.slice(30, Math.min(35, qHeaders.length))),
    infraestruturaItens: makeItens(dims['Instalações Físicas e Recursos de TI'])
  };
}

/* ---------- Cards best/worst ---------- */
function computeBestWorstGroup(year, yearObj) {
  const rows = yearObj?.rows || [];
  if (!rows.length) return { labelType: year === '2025' ? 'Polo' : 'Curso', best: '—', worst: '—' };
  if (year === '2025') {
    const headers = yearObj.qHeadersFull || [];
    const groupKey = 'Qual o seu Polo de Vinculação?';
    const toScore = (ans) => {
      if (!ans) return null;
      const a = String(ans).trim();
      if (a.startsWith('Excelente')) return 4;
      if (a.startsWith('Bom'))       return 3;
      if (a.startsWith('Regular'))   return 2;
      if (a.startsWith('Insuficiente')) return 1;
      if (/^n(ã|a)o se aplica/i.test(a)) return null;
      return null;
    };
    const sums = new Map();
    rows.forEach(r => {
      const g = r[groupKey];
      if (!g) return;
      headers.forEach(h => {
        const v = toScore(r[h]);
        if (v == null) return;
        const curr = sums.get(g) || { sum: 0, count: 0 };
        curr.sum += v;
        curr.count += 1;
        sums.set(g, curr);
      });
    });
    let best = '—', worst = '—', bestAvg = -Infinity, worstAvg = Infinity;
    for (const [g, { sum, count }] of sums) {
      if (!count) continue;
      const avg = sum / count;
      if (avg > bestAvg) { bestAvg = avg; best = g; }
      if (avg < worstAvg) { worstAvg = avg; worst = g; }
    }
    return { labelType: 'Polo', best, worst };
  } else {
    const headers = getQHeadersFromRows2023(rows);
    const endInfra = Math.min(43, headers.length);
    const usedHeaders = headers.slice(0, endInfra);
    const groupKey = 'curso';
    const toScore = (n) => {
      const v = Number(n);
      if (v === 5 || !Number.isFinite(v)) return null;
      if (v === 4) return 4;
      if (v === 3) return 3;
      if (v === 2) return 2;
      if (v === 1) return 1;
      return null;
    };
    const sums = new Map();
    rows.forEach(r => {
      const g = r[groupKey];
      if (!g || /^qual\b/i.test(g)) return;
      usedHeaders.forEach(h => {
        const v = toScore(r[h]);
        if (v == null) return;
        const curr = sums.get(g) || { sum: 0, count: 0 };
        curr.sum += v;
        curr.count += 1;
        sums.set(g, curr);
      });
    });
    let best = '—', worst = '—', bestAvg = -Infinity, worstAvg = Infinity;
    for (const [g, { sum, count }] of sums) {
      if (!count) continue;
      const avg = sum / count;
      if (avg > bestAvg) { bestAvg = avg; best = g; }
      if (avg < worstAvg) { worstAvg = avg; worst = g; }
    }
    return { labelType: 'Curso', best, worst };
  }
}

export default function EadDashboardClient({
  initialData,
  filtersOptions,
  initialDataByYear,
  defaultYear = '2025'
}) {
  const [activeTab, setActiveTab] = useState('dimensoes');

  const [selectedFilters, setSelectedFilters] = useState({
    ano: defaultYear,
    dimensao: 'todos',
    polo: 'todos',
    curso: 'todos',
    disciplina: 'todos'
  });

  const getDataForYear = (year) =>
    (initialDataByYear && initialDataByYear[year]) ? initialDataByYear[year] : initialData;

  const [dashboardData, setDashboardData] = useState(getDataForYear(selectedFilters.ano));

  useEffect(() => {
    const year = selectedFilters.ano;
    const yearData = getDataForYear(year);
    setDashboardData(yearData);

    const foYear = initialDataByYear?.[year]?.filtersOptionsYear || {};
    const polos = year === '2023' ? [] : sanitizeList(foYear.polos || filtersOptions.polos);
    const cursos = sanitizeList(foYear.cursos || filtersOptions.cursos);
    const disciplinas = sanitizeList(foYear.disciplinas || filtersOptions.disciplinas);

    setSelectedFilters(prev => ({
      ...prev,
      polo: (year === '2023' || !polos.includes(prev.polo)) ? 'todos' : prev.polo,
      curso: (!cursos.includes(prev.curso)) ? 'todos' : prev.curso,
      disciplina: (!disciplinas.includes(prev.disciplina)) ? 'todos' : prev.disciplina
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters.ano]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setSelectedFilters(prev => ({ ...prev, [name]: value }));
  };

  const filtersForUi = useMemo(() => {
    const year = selectedFilters.ano;
    const foYear = initialDataByYear?.[year]?.filtersOptionsYear || {};
    return {
      anos: sanitizeList(filtersOptions.anos),
      dimensoes: sanitizeList(filtersOptions.dimensoes),
      polos: year === '2023' ? [] : sanitizeList(foYear.polos),
      cursos: sanitizeList(foYear.cursos),
      disciplinas: sanitizeList(foYear.disciplinas)
    };
  }, [filtersOptions, initialDataByYear, selectedFilters.ano]);

  const recalculated = useMemo(() => {
    const year = selectedFilters.ano;
    const yearObj = initialDataByYear?.[year];
    const rows = yearObj?.rows;

    if (!rows || !rows.length) {
      return {
        dimensoes: dashboardData?.dimensoes || [],
        mediasPorDim: dashboardData?.mediasPorDim || [],
        boxplotDimRaw: dashboardData?.boxplotDimRaw || [],
        autoavaliacaoItens: dashboardData?.autoavaliacaoItens || [],
        acaoDocenteAtitude: dashboardData?.acaoDocenteAtitude || [],
        acaoDocenteGestao: dashboardData?.acaoDocenteGestao || [],
        acaoDocenteProcesso: dashboardData?.acaoDocenteProcesso || [],
        infraestruturaItens: dashboardData?.infraestruturaItens || [],
        // novas médias vazias
        mediasItensAuto: [],
        boxplotItensAutoRaw: [],
        mediasItensAtitude: [],
        mediasItensGestao: [],
        mediasItensProcesso: [],
        mediasItensInfra: []
      };
    }

    const cursoSel = selectedFilters.curso;
    const poloSel = selectedFilters.polo;
    const discSel = selectedFilters.disciplina;

    let filtered = rows;
    if (year === '2025') {
      if (cursoSel !== 'todos') filtered = filtered.filter(r => r['Qual é o seu Curso?'] === cursoSel);
      if (poloSel !== 'todos')  filtered = filtered.filter(r => r['Qual o seu Polo de Vinculação?'] === poloSel);
      if (discSel !== 'todos') {
        filtered = filtered.filter(r => {
          const keys = Object.keys(r).filter(k => k.startsWith('Selecione para qual disciplina'));
          return keys.some(k => r[k] === discSel);
        });
      }
      const qHeadersFull = yearObj?.qHeadersFull || [];
      return aggregateFromRows2025(filtered, qHeadersFull);
    } else {
      if (cursoSel !== 'todos') filtered = filtered.filter(r => r.curso === cursoSel);
      if (discSel !== 'todos')  filtered = filtered.filter(r => r.disciplina === discSel);
      const qHeaders = getQHeadersFromRows2023(filtered);
      return aggregateFromRows2023(filtered, qHeaders);
    }
  }, [initialDataByYear, dashboardData, selectedFilters]);

  /* ---------- filtro dimensões ---------- */
  const dimensoesFiltradas = useMemo(() => {
    const base = recalculated.dimensoes || [];
    if (selectedFilters.dimensao === 'todos') return base;
    return base.filter(d => d.dimensao === selectedFilters.dimensao);
  }, [recalculated, selectedFilters.dimensao]);

  /* ---------- Dados p/ gráficos ---------- */
  const chartData = useMemo(() => {
    const mediasLabels = (recalculated.mediasPorDim || []).map(d => d.dimensao);
    // força 2 casas
    const mediasValues = (recalculated.mediasPorDim || []).map(d => round2(d.media));

    const boxRaw = recalculated.boxplotDimRaw || [];
    const all = boxRaw.map(item =>
      buildApexBoxplotFromValues(wrapForApex(item.dimensao), item.values)
    );
    const boxplot_data = all.flatMap(o => o.boxplot_data);
    const outliers_data = all.flatMap(o => o.outliers_data);

    // Autoavaliação — BOX PLOT POR ITEM (x numérico + ordenado)
    const mediasItensLabels = (recalculated.mediasItensAuto || []).map(i => i.item);
    const mediasItensValues = (recalculated.mediasItensAuto || []).map(i => round2(i.media));
    const boxAutoAll = (recalculated.boxplotItensAutoRaw || [])
      .map(it => buildApexBoxplotFromValues(it.item, it.values, true));
    // ordena por x numérico para garantir alinhamento 1..N
    boxAutoAll.sort((a, b) => {
      const ax = Number(a.boxplot_data?.[0]?.x ?? 0);
      const bx = Number(b.boxplot_data?.[0]?.x ?? 0);
      return ax - bx;
    });
    const boxplot_auto_data = boxAutoAll.flatMap(o => o.boxplot_data);
    const outliers_auto_data = boxAutoAll.flatMap(o => o.outliers_data);

    // NOVO: médias por item nas demais abas
    const mapMedias = (arr=[]) => ({
      labels: arr.map(i => i.item),
      datasets: [{ label: 'Média', data: arr.map(i => round2(i.media)), backgroundColor: 'rgba(40, 143, 180, 0.7)' }]
    });

    return {
      // Dimensões Gerais
      dimensoes: formatProporcoesChartData(dimensoesFiltradas),
      mediasDimensoes: {
        labels: mediasLabels.map(lbl => wrapWords(lbl)),
        datasets: [{
          label: 'Média',
          data: mediasValues,
          backgroundColor: 'rgba(40, 143, 180, 0.7)'
        }]
      },
      boxplotDimApex: { boxplot_data, outliers_data },

      // Autoavaliação
      autoavaliacao: formatProporcoesItensChartData(recalculated.autoavaliacaoItens || []),
      mediasItensAuto: {
        labels: mediasItensLabels,
        datasets: [{
          label: 'Média',
          data: mediasItensValues,
          backgroundColor: 'rgba(40, 143, 180, 0.7)'
        }]
      },
      boxplotAutoApex: { boxplot_data: boxplot_auto_data, outliers_data: outliers_auto_data },

      // Demais seções
      acaoDocenteAtitude: formatProporcoesItensChartData(recalculated.acaoDocenteAtitude || []),
      acaoDocenteGestao: formatProporcoesItensChartData(recalculated.acaoDocenteGestao || []),
      acaoDocenteProcesso: formatProporcoesItensChartData(recalculated.acaoDocenteProcesso || []),
      infraestruturaItens: formatProporcoesItensChartData(recalculated.infraestruturaItens || []),

      // NOVOS datasets de médias
      mediasItensAtitude:   mapMedias(recalculated.mediasItensAtitude),
      mediasItensGestao:    mapMedias(recalculated.mediasItensGestao),
      mediasItensProcesso:  mapMedias(recalculated.mediasItensProcesso),
      mediasItensInfra:     mapMedias(recalculated.mediasItensInfra),
    };
  }, [recalculated, dimensoesFiltradas]);

  const bestWorst = useMemo(() => {
    const year = selectedFilters.ano;
    const yearObj = initialDataByYear?.[year];
    return computeBestWorstGroup(year, yearObj);
  }, [initialDataByYear, selectedFilters.ano]);

  const tabs = [
    { key: 'dimensoes', label: 'Dimensões Gerais' },
    { key: 'autoavaliacao', label: 'Autoavaliação Discente' },
    { key: 'atitude', label: 'Atitude Profissional' },
    { key: 'gestao', label: 'Gestão Didática' },
    { key: 'processo', label: 'Processo Avaliativo' },
    { key: 'infraestrutura', label: 'Instalações Físicas e Recursos de TI' }
  ];

  // Opções com 2 casas decimais para Dimensões Gerais
  const dimensoesOptions = {
    layout: { padding: { top: 25 } },
    plugins: {
      legend: { display: false }, // sem legenda padrão
      tooltip: {
        callbacks: {
          label: (context) => {
            const ds = context.dataset?.label ? `${context.dataset.label}: ` : '';
            const y = context.parsed?.y;
            const val = typeof y === 'number' ? y.toFixed(2) : y;
            return `${ds}${val}`;
          }
        }
      },
      datalabels: {
        display: 'auto',
        formatter: (v) => (typeof v === 'number' && v > 0 ? v.toFixed(2) : ''),
        font: { size: 9 },
        anchor: 'end',
        align: 'top',
        offset: 4,
        color: '#333'
      }
    },
    scales: { y: { max: 100 } }
  };

  // opções para o gráfico de médias (eixo X com labels multiline)
  const mediasOptions = {
    plugins: { legend: { display: false } },
    scales: {
      y: { min: 0, max: 4, ticks: { font: { size: 10 }, callback: (v) => Number(v).toFixed(2) } },
      x: {
        ticks: {
          font: { size: 10 },
          autoSkip: false, maxRotation: 0, minRotation: 0
        }
      }
    }
  };

  // opções comuns p/ “Proporções por item” (0–100) — SEM LEGENDA + 2 casas + título no tooltip = pergunta
  const proporcoesItensOptions = {
    layout: { padding: { top: 25 } },
    plugins: {
      legend: { display: false }, // tira a legenda em cima
      tooltip: {
        callbacks: {
          title: (ti) => {
            const itemIndex = ti?.[0]?.label;
            return questionMapEad[itemIndex] || `Item ${itemIndex}`;
          },
          label: (context) => {
            const ds = context.dataset?.label ? `${context.dataset.label}: ` : '';
            const y = context.parsed?.y;
            const val = typeof y === 'number' ? y.toFixed(2) : y;
            return `${ds}${val}`;
          }
        }
      },
      datalabels: {
        display: 'auto',
        formatter: v => (typeof v === 'number' && v > 0 ? v.toFixed(2) : ''),
        font: { size: 8 },
        anchor: 'end',
        align: 'top',
        offset: 4,
        color: '#333'
      }
    },
    scales: { y: { max: 100 } }
  };

  // opções para médias por item (0–4) — tooltip mostra a pergunta
  const mediasItensOptions = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (ti) => {
            const itemIndex = ti?.[0]?.label;
            return questionMapEad[itemIndex] || `Item ${itemIndex}`;
          },
          label: (context) => {
            const y = context.parsed?.y;
            const val = typeof y === 'number' ? y.toFixed(2) : y;
            return `Média: ${val}`;
          }
        }
      }
    },
    scales: { y: { min: 0, max: 4, ticks: { callback: (v) => Number(v).toFixed(2) } } }
  };

  /* ====== LAYOUT ABA "DIMENSÕES" ====== */
  const gridDimensoes = {
    display: 'grid',
    gridTemplateColumns: '1.8fr 1fr',
    gridAutoRows: 'minmax(300px, auto)',
    gap: '16px',
    alignItems: 'stretch'
  };
  const leftBig = { gridColumn: '1 / 2', gridRow: '1 / span 2', height: 666 };
  const rightTop = { gridColumn: '2 / 3', gridRow: '1', height: 300 };
  const rightBottom = { gridColumn: '2 / 3', gridRow: '2', height: 350 };

  /* ====== LAYOUT ABA "AUTOAVALIAÇÃO" ====== */
  const gridAuto = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gridTemplateRows: '300px 330px 300px',
    gap: '12px'
  };
  const autoTopFull    = { gridColumn: '1 / -1', gridRow: '1', height: 300 };
  const autoBoxFull    = { gridColumn: '1 / -1', gridRow: '2', height: 330 };
  const autoMediasFull = { gridColumn: '1 / -1', gridRow: '3', height: 300 };

  /* ====== LAYOUT para as demais abas (2 linhas) ====== */
  const gridTwoRows = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gridTemplateRows: '300px 300px',
    gap: '12px'
  };
  const topRow = { gridColumn: '1 / -1', gridRow: '1', height: 300 };
  const bottomRow = { gridColumn: '1 / -1', gridRow: '2', height: 300 };

  return (
    <>
      <div className={styles.statsGrid}>
        <StatCard title="Total de Respondentes" value={dashboardData?.summary?.total_respostas?.[0] ?? '...'} icon={<Users />} />
        <StatCard title={`${bestWorst.labelType} mais bem avaliado`} value={truncateText(bestWorst.best) ?? '—'} icon={<TrendingUp />} />
        <StatCard title={`${bestWorst.labelType} menos bem avaliado`} value={truncateText(bestWorst.worst) ?? '—'} icon={<TrendingDown />} />
      </div>

      <div style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
        <EadFilters filters={filtersForUi} selectedFilters={selectedFilters} onFilterChange={handleFilterChange} />
      </div>

      <div>
        <div className={styles.tabsContainer} style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '10px' }}>
          {tabs.map(tab => (
            <button key={tab.key} className={activeTab === tab.key ? styles.activeTab : styles.tab} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.chartDisplayArea}>
          {activeTab === 'dimensoes' && (
            <div style={gridDimensoes}>
              {/* ESQUERDA (Proporções por Dimensão) */}
              <div className={styles.chartContainer} style={leftBig}>
                <ActivityChart
                  chartData={chartData.dimensoes}
                  title={`Proporções de Respostas por Dimensão (${selectedFilters.ano})`}
                  customOptions={dimensoesOptions}
                />
              </div>

              {/* DIREITA TOPO (Médias) */}
              <div className={styles.chartContainer} style={rightTop}>
                <ActivityChart
                  chartData={chartData.mediasDimensoes}
                  title={`Médias por Dimensão (${selectedFilters.ano})`}
                  customOptions={mediasOptions}
                />
              </div>

              {/* DIREITA BASE (Boxplot por dimensão) */}
              <div className={styles.chartContainer} style={rightBottom}>
                <BoxplotChart
                  apiData={chartData.boxplotDimApex}
                  title={`Boxplot das Médias por Dimensão (${selectedFilters.ano})`}
                />
              </div>
            </div>
          )}

          {activeTab === 'autoavaliacao' && (
            <div style={gridAuto}>
              {/* 1) TOPO: Proporções por item */}
              <div className={styles.chartContainer} style={autoTopFull}>
                <ActivityChart
                  chartData={chartData.autoavaliacao}
                  title={`Proporções de Respostas por Item - Autoavaliação Discente (${selectedFilters.ano})`}
                  customOptions={proporcoesItensOptions} // SEM legenda + 2 casas + tooltip título = pergunta
                />
              </div>

              {/* 2) MEIO: Boxplot por item */}
              <div className={styles.chartContainer} style={autoBoxFull}>
                <BoxplotChart
                  apiData={chartData.boxplotAutoApex}
                  title="Boxplot Discente"
                />
              </div>

              {/* 3) BAIXO: Médias por item */}
              <div className={styles.chartContainer} style={autoMediasFull}>
                <ActivityChart
                  chartData={chartData.mediasItensAuto}
                  title={`Médias dos Itens relacionados à Autoavaliação Discente (${selectedFilters.ano})`}
                  customOptions={mediasItensOptions}
                />
              </div>
            </div>
          )}

          {activeTab === 'atitude' && (
            <div style={gridTwoRows}>
              <div className={styles.chartContainer} style={topRow}>
                <ActivityChart
                  chartData={chartData.acaoDocenteAtitude}
                  title={`Proporções de Respostas por Item - Atitude Profissional (${selectedFilters.ano})`}
                  customOptions={proporcoesItensOptions} // remove legenda + 2 casas + tooltip com pergunta
                />
              </div>
              <div className={styles.chartContainer} style={bottomRow}>
                <ActivityChart
                  chartData={chartData.mediasItensAtitude}
                  title={`Médias dos Itens relacionados à Atitude Profissional (Discente)`}
                  customOptions={mediasItensOptions}
                />
              </div>
            </div>
          )}

          {activeTab === 'gestao' && (
            <div style={gridTwoRows}>
              <div className={styles.chartContainer} style={topRow}>
                <ActivityChart
                  chartData={chartData.acaoDocenteGestao}
                  title={`Proporções de Respostas por Item - Gestão Didática (${selectedFilters.ano})`}
                  customOptions={proporcoesItensOptions} // corrige tooltip p/ mostrar pergunta e 2 casas
                />
              </div>
              <div className={styles.chartContainer} style={bottomRow}>
                <ActivityChart
                  chartData={chartData.mediasItensGestao}
                  title={`Médias dos Itens relacionados à Gestão Didática (Discente)`}
                  customOptions={mediasItensOptions}
                />
              </div>
            </div>
          )}

          {activeTab === 'processo' && (
            <div style={gridTwoRows}>
              <div className={styles.chartContainer} style={topRow}>
                <ActivityChart
                  chartData={chartData.acaoDocenteProcesso}
                  title={`Proporções de Respostas por Item - Processo Avaliativo (${selectedFilters.ano})`}
                  customOptions={proporcoesItensOptions} // 2 casas + pergunta no tooltip + sem legenda
                />
              </div>
              <div className={styles.chartContainer} style={bottomRow}>
                <ActivityChart
                  chartData={chartData.mediasItensProcesso}
                  title={`Médias dos Itens relacionados ao Processo Avaliativo (Discente)`}
                  customOptions={mediasItensOptions}
                />
              </div>
            </div>
          )}

          {activeTab === 'infraestrutura' && (
            <div style={gridTwoRows}>
              <div className={styles.chartContainer} style={topRow}>
                <ActivityChart
                  chartData={chartData.infraestruturaItens}
                  title={`Proporções de Respostas por Item - Instalações Físicas e Recursos de TI (${selectedFilters.ano})`}
                  customOptions={proporcoesItensOptions} // 2 casas + pergunta no tooltip + sem legenda
                />
              </div>
              <div className={styles.chartContainer} style={bottomRow}>
                <ActivityChart
                  chartData={chartData.mediasItensInfra}
                  title={`Médias dos Itens relacionados às Instalações Físicas e Recursos de TI (Discente)`}
                  customOptions={mediasItensOptions}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
