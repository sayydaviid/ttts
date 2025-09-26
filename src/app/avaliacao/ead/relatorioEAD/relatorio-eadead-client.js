'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EadFilters from '../../avalia/components/EadFilters';
import styles from '../../../../styles/dados.module.css';

export default function RelatorioEadClient({ filtersByYear, anosDisponiveis, initialSelected }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ================== Constantes ==================
  const ALL_POLOS_LABEL = 'Todos os Polos';
  const CRITICAL_CHART_IDS = [
    'chart-dimensoes',
    'chart-medias-dimensoes',
    'chart-boxplot-dimensoes',
    'chart-proporcoes-autoav',
    'chart-boxplot-autoav',
    'chart-boxplot-atitude',
    'chart-boxplot-gestao',
    'chart-boxplot-processo',
    'chart-boxplot-infra',
  ];

  const TABLE_IDS = [
    { id: 'table-stats-dimensoes' },
    { id: 'table-stats-autoav' },
    { id: 'table-stats-atitude' },
    { id: 'table-stats-gestao' },
    { id: 'table-stats-processo' },
    { id: 'table-stats-infra' },
  ];

  // espaçamentos (pt)
  const SPACING = {
    afterSectionTitle: 4,
    chartToLegend: 8,
    legendRowGap: 4,
    legendToCaption: 12,
    afterCaption: 10,
    betweenStacked: 16,
    minFreeForTable: 120, // mínimo para “caber” uma tabela no resto da página
  };

  // =============== estado/seleção =================
  const preferredAno =
    (initialSelected?.ano && String(initialSelected.ano)) ||
    (Array.isArray(anosDisponiveis) && anosDisponiveis.includes('2025') ? '2025' : (anosDisponiveis?.[0] || ''));

  const [selected, setSelected] = useState({
    ano: preferredAno,
    curso: initialSelected?.curso || '',
    polo: initialSelected?.polo || '',
  });

  const yearDef = selected.ano
    ? (filtersByYear[selected.ano] || { hasPolos: false, polos: [], cursos: [] })
    : { hasPolos: false, polos: [], cursos: [] };

  const isAllPolos =
    !!yearDef.hasPolos &&
    (selected.polo === ALL_POLOS_LABEL || selected.polo === '__ALL__');

  const filters = useMemo(() => ({
    anos: anosDisponiveis,
    cursos: selected.ano ? (yearDef.cursos || []) : [],
    polos: (selected.ano && yearDef.hasPolos) ? [ALL_POLOS_LABEL, ...(yearDef.polos || [])] : [],
    disciplinas: [],
    dimensoes: [],
  }), [anosDisponiveis, selected.ano, yearDef]);

  const syncURL = (next) => {
    const sp = new URLSearchParams(searchParams.toString());
    next.ano ? sp.set('ano', next.ano) : sp.delete('ano');
    next.curso ? sp.set('curso', next.curso) : sp.delete('curso');
    if (next.ano && filtersByYear[next.ano]?.hasPolos && next.polo && next.polo !== ALL_POLOS_LABEL) sp.set('polo', next.polo);
    else sp.delete('polo');
    router.replace(sp.toString() ? `?${sp.toString()}` : '?');
  };

  const handleFilterChange = (e) => {
    const key = e?.target?.name;
    const value = e?.target?.value ?? '';
    const next = { ...selected, [key]: value };

    if (key === 'ano') {
      setPdfUrl('');
      setPdfError('');
      next.curso = '';
      next.polo = '';
    }

    if (key === 'curso' && !selected.ano) next.curso = '';
    if (key === 'polo' && !(selected.ano && yearDef.hasPolos)) next.polo = '';

    setSelected(next);
    syncURL(next);
  };

  /* =========================
     GERAÇÃO DO PDF AO VIVO
     ========================= */
  const [pdfUrl, setPdfUrl] = useState('');
  const prevUrlRef = useRef('');
  const [pdfError, setPdfError] = useState('');

  const canGenerate = !!selected.ano && !!selected.curso && (!yearDef.hasPolos || !!selected.polo);

  // ========= IFRAME COM O DASHBOARD =========
  const chartsIframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);

  const iframeSrc = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('ano', selected.ano || '');
    sp.set('curso', selected.curso || '');
    if (yearDef.hasPolos && selected.polo && !isAllPolos) sp.set('polo', selected.polo);
    sp.set('embedForPdf', '1');
    return `/avaliacao/ead?${sp.toString()}`;
  }, [selected.ano, selected.curso, selected.polo, yearDef.hasPolos, isAllPolos]);

  useEffect(() => { setIframeReady(false); }, [iframeSrc]);

  // ============= helpers comuns =============
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getIframeDoc = () => {
    const ifr = chartsIframeRef.current;
    return ifr?.contentWindow?.document || ifr?.contentDocument || null;
  };
  const nudgeIframeLayout = () => {
    const ifr = chartsIframeRef.current;
    if (!ifr) return;
    try {
      const win = ifr.contentWindow;
      if (!win) return;
      // forçar relayout
      void ifr.offsetHeight;
      win.dispatchEvent(new win.Event('resize'));
      if (win.scrollTo) win.scrollTo(0, 1);
    } catch {}
  };
  const findChartEl = (doc, id) => {
    if (!doc) return null;
    const el = doc.querySelector(`#${id}`);
    if (!el) return null;
    const c = el.querySelector('canvas');
    const s = el.querySelector('svg');
    if (c && c.width > 0 && c.height > 0) return el;
    if (s) {
      const bb = s.getBBox ? s.getBBox() : null;
      if (!bb || (bb.width > 0 && bb.height > 0)) return el;
    }
    const rect = el.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) return el;
    return null;
  };
  const waitForChart = async (id, timeoutMs = 30000) => {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const el = findChartEl(getIframeDoc(), id);
      if (el) return el;
      nudgeIframeLayout();
      await sleep(140);
    }
    console.warn(`Timeout esperando pelo gráfico/tabela: #${id}`);
    return null;
  };
  const waitForManyCharts = async (ids, timeoutMs = 40000) => {
    const deadline = performance.now() + timeoutMs;
    const pending = new Set(ids);
    while (pending.size && performance.now() < deadline) {
      const doc = getIframeDoc();
      for (const id of Array.from(pending)) {
        if (findChartEl(doc, id)) pending.delete(id);
      }
      if (!pending.size) break;
      nudgeIframeLayout();
      await sleep(150);
    }
    await sleep(250);
    if (pending.size > 0) console.warn('Timeout esperando pelos elementos:', Array.from(pending));
    return pending.size === 0;
  };

  // converte QUALQUER elemento HTML em PNG via <foreignObject>, com retry
  const elementToPngDataUrl = async (el) => {
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const clone = el.cloneNode(true);
    clone.style.background = '#ffffff';
    const serializer = new XMLSerializer();
    const xhtml = serializer.serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
         <foreignObject width="100%" height="100%">${xhtml}</foreignObject>
       </svg>`;
    const svg64 = typeof window.btoa === 'function' ? window.btoa(unescape(encodeURIComponent(svg))) : '';
    const dataUrl = `data:image/svg+xml;base64,${svg64}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || w;
    c.height = img.naturalHeight || h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  };

  // captura com retry (evita PNG vazio)
  const getDataUrlFromChartContainer = async (containerId) => {
    const el = await waitForChart(containerId);
    if (!el) return null;

    const tryOnce = async () => {
      // canvas primeiro
      const canvas = el.querySelector('canvas');
      if (canvas) {
        try {
          const data = canvas.toDataURL('image/png');
          if (data && data.length > 1000) return data;
        } catch {}
      }
      // svg
      const svg = el.querySelector('svg');
      if (svg) {
        try {
          const cloned = svg.cloneNode(true);
          cloned.setAttribute('style', 'background:#ffffff');
          const serializer = new XMLSerializer();
          const svgStr = serializer.serializeToString(cloned);
          const svg64 = typeof window.btoa === 'function' ? window.btoa(unescape(encodeURIComponent(svgStr))) : '';
          const image64 = `data:image/svg+xml;base64,${svg64}`;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = image64; });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 1600;
          c.height = img.naturalHeight || 900;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          const data = c.toDataURL('image/png');
          if (data && data.length > 1000) return data;
        } catch {}
      }
      // fallback: elemento HTML (tabela etc.)
      try {
        const data = await elementToPngDataUrl(el);
        if (data && data.length > 1000) return data;
      } catch {}
      return null;
    };

    for (let i = 0; i < 6; i++) {
      const data = await tryOnce();
      if (data) return data;
      nudgeIframeLayout();
      await sleep(180 + i * 60);
    }
    console.warn('Falha ao capturar container:', containerId);
    return null;
  };

  const loadDashboardFor = async ({ ano, curso, poloName }) => {
    const ifr = chartsIframeRef.current;
    if (!ifr) return;

    const sp = new URLSearchParams();
    sp.set('ano', ano || '');
    sp.set('curso', curso || '');
    if (yearDef.hasPolos && poloName) sp.set('polo', String(poloName));
    sp.set('embedForPdf', '1');
    const target = `/avaliacao/ead?${sp.toString()}`;

    await new Promise((resolve) => {
      const onLoad = async () => {
        ifr.removeEventListener('load', onLoad);
        await sleep(250);
        nudgeIframeLayout();
        resolve();
      };
      ifr.addEventListener('load', onLoad);
      setIframeReady(false);
      ifr.src = target;
    });

    const allIds = [...CRITICAL_CHART_IDS, ...TABLE_IDS.map(t => t.id)];
    await waitForManyCharts(allIds);
    await sleep(250);
  };

  const mergeWithExternalPdf = async (basePdfBytes, externalPdfPath) => {
    const { PDFDocument } = await import('pdf-lib');
    const basePdf = await PDFDocument.load(basePdfBytes);
    try {
      const extBytes = await (await fetch(externalPdfPath)).arrayBuffer();
      const extPdf = await PDFDocument.load(extBytes);
      const copied = await basePdf.copyPages(extPdf, extPdf.getPageIndices());
      copied.forEach((p) => basePdf.addPage(p));
    } catch {}
    const merged = await basePdf.save();
    return new Blob([merged], { type: 'application/pdf' });
  };

  // ===== helpers visuais de PDF =====
  const drawImageContain = async (doc, dataUrl, boxX, boxY, boxW, boxH, fmt = 'PNG') => {
    if (!dataUrl) return { finalH: 0, yPos: boxY };
    const loadImg = (src) =>
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
        im.onerror = reject;
        im.src = src;
      });

    const { w, h } = await loadImg(dataUrl);
    if (!w || !h) return { finalH: 0, yPos: boxY };

    const scale = Math.min(boxW / w, boxH / h);
    const drawW = w * scale;
    const drawH = h * scale;

    const x = boxX + (boxW - drawW) / 2;
    const y = boxY;

    doc.addImage(dataUrl, fmt, x, y, drawW, drawH, undefined, 'FAST');
    return { finalH: drawH, yPos: y };
  };

  const fetchAsDataUrl = async (url) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(blob);
    });
  };

  const drawLegendFactory = (doc, pageWidth) => (yLegend, items, opts = {}) => {
    const LEGENDA_ITEMS = items || [
      { label: 'Excelente',    color: '#1D556F' },
      { label: 'Bom',          color: '#288FB4' },
      { label: 'Regular',      color: '#F0B775' },
      { label: 'Insuficiente', color: '#FA360A' },
    ];
    const { fontSize = 9, box = 8, textGap = 4, itemGap = 8, left = 40, right = 40, maxWidth = null } = opts;

    doc.setFont('helvetica','normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(0,0,0);

    const usable = (maxWidth ?? (pageWidth - left - right));
    const lines = [[]];
    let lineW = 0;

    LEGENDA_ITEMS.forEach((it) => {
      const labelW = doc.getTextWidth(it.label);
      const w = box + textGap + labelW;
      const addW = (lines[lines.length-1].length ? itemGap : 0) + w;
      if (lineW + addW > usable && lines[lines.length-1].length) { lines.push([it]); lineW = w; }
      else { lines[lines.length-1].push(it); lineW += addW; }
    });

    let currentY = yLegend;
    lines.forEach((row, idx) => {
      const rowW = row.reduce((acc, it, i) => acc + (i ? itemGap : 0) + (box + textGap + doc.getTextWidth(it.label)), 0);
      let x = (pageWidth - rowW) / 2;
      row.forEach((it) => {
        doc.setFillColor(it.color);
        doc.rect(x, currentY - box + 1, box, box, 'F');
        x += box + textGap;
        doc.text(it.label, x, currentY);
        x += doc.getTextWidth(it.label) + itemGap;
      });
      if (idx < lines.length - 1) currentY += fontSize + SPACING.legendRowGap;
    });

    const totalHeight = (currentY - yLegend) + fontSize;
    return yLegend + totalHeight;
  };

  const buildingRef = useRef(false);

  // =================== buildPdf ===================
  useEffect(() => {
    let cancelled = false;

    async function buildPdf() {
      if (buildingRef.current) return;
      buildingRef.current = true;

      setPdfError('');
      if (!canGenerate || !iframeReady) {
        if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = ''; }
        setPdfUrl('');
        buildingRef.current = false;
        return;
      }

      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let y = margin;
        let FIG_NO = 1;

        const drawLegend = drawLegendFactory(doc, pageWidth);
        const addFigureCaption = (yCap, caption) => {
          if (!caption) return yCap;
          doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(0,0,0);
          const text = `Figura ${FIG_NO} — ${caption}`;
          const textLines = doc.splitTextToSize(text, pageWidth - 2*margin);
          doc.text(textLines, pageWidth/2, yCap, { align:'center' });
          FIG_NO += 1;
          const textHeight = doc.getTextDimensions(textLines).h;
          return yCap + textHeight;
        };
        const drawCenteredWrapped = (text, y0, maxWidth, size) => {
          doc.setFont('helvetica','bold'); doc.setFontSize(size);
          const lines = doc.splitTextToSize(text, maxWidth);
          doc.text(lines, pageWidth/2, y0, { align: 'center' });
          const lh = size*0.55 + 4;
          return y0 + lines.length*lh;
        };

        // CAPA
        try {
          const capaDataUrl = await fetchAsDataUrl('/capa_avalia.png');
          const coverMarginX = 36, coverMarginY = 48;
          await drawImageContain(doc, capaDataUrl, coverMarginX, coverMarginY, pageWidth - 2*coverMarginX, pageHeight - 2*coverMarginY, 'PNG');
        } catch {}

        // APRESENTAÇÃO
        doc.addPage(); y = margin;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text(`APRESENTAÇÃO DO RELATÓRIO AVALIA ${selected.ano}`, pageWidth/2, y, { align:'center' });
        y += 22;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
        const paragraphs = [
          'A Autoavaliação dos Cursos de Graduação a Distância da UFPA (AVALIA EAD) é coordenada pela Comissão Própria de Avaliação (CPA), em parceria com a Diretoria de Avaliação Institucional (DIAVI/PROPLAN).',
          'O AVALIA-EAD foi elaborado com o intuito de conhecer a percepção dos discentes sobre o seu curso de graduação a distância, de modo a contribuir para a implementação de avanços qualitativos nas condições de ensino e aprendizagem.',
          'O formulário do AVALIA-EAD contempla três dimensões inter-relacionadas que correspondem a: Autoavaliação discente (Dimensão 1); Avaliação da Ação Docente (Dimensão 2), com três subdimensões (Atitude Profissional, Gestão Didática e Processo Avaliativo); e Instalações Físicas e Recursos de TI (Dimensão 3).',
          'No presente relatório, a CPA divulga os resultados da aplicação do AVALIA EAD, referente às atividades curriculares desenvolvidas no Período Letivo 2025-2. Os ítens abordados possibilitam avaliar cada atividade curricular realizada no período letivo, com respeito à três Dimensões supracitadas, com base em uma escala de 1 (Insuficiente) a 4 (Excelente). Alguns itens possuem a alternativa Não se Aplica.',
          'Para a análise das respostas dos discentes, foram utilizadas duas representações gráficas principais: gráficos de barras e boxplots. Os gráficos de barras apresentam o percentual de respostas e a média das respostas, tanto por dimensão como por ítem. Já os boxplots mostram a distribuição das médias de avaliação por disciplina/docente.',
        ];
        for (let i=0;i<paragraphs.length;i++){
          const lines = doc.splitTextToSize(paragraphs[i], pageWidth - 2*margin);
          doc.text(lines, margin, y); y += lines.length*13 + 6;
          if (y > pageHeight - margin - 200 && i < paragraphs.length - 1) { doc.addPage(); y = margin; }
        }
        try {
          const boxplotInfo = await fetchAsDataUrl('/boxplot.jpeg');
          const boxMaxW = pageWidth - 2*margin, boxMaxH = 240;
          const spaceLeft = pageHeight - y - margin;
          if (spaceLeft < boxMaxH + 12) { doc.addPage(); y = margin; }
          const { finalH, yPos } = await drawImageContain(doc, boxplotInfo, margin, y, boxMaxW, boxMaxH, 'JPEG');
          const yAfter = yPos + finalH + SPACING.legendToCaption;
          addFigureCaption(yAfter, 'Exemplo de Boxplot');
        } catch {}

        // ===== Helpers/Seções que retornam posição final =====
        const addTwoChartsSection = async ({ title, bigChartId, smallChartId, bigChartSubTitle, smallChartSubTitle, startHint }) => {
          const imgBig = await getDataUrlFromChartContainer(bigChartId);
          const imgSmall = await getDataUrlFromChartContainer(smallChartId);
          if (!imgBig && !imgSmall) return { page: doc.getNumberOfPages(), y: margin };

          const fullW = pageWidth - 2*margin;
          const titleHeightTmp = doc.getTextDimensions(title).h;
          const needForHeadAndBig = titleHeightTmp + SPACING.afterSectionTitle + 300 + 40;

          let startPage;
          let currentY;
          if (startHint && startHint.page === doc.getNumberOfPages() && (pageHeight - startHint.y - margin) >= needForHeadAndBig) {
            startPage = startHint.page;
            currentY  = startHint.y + 4;
          } else {
            doc.addPage();
            startPage = doc.getNumberOfPages();
            currentY  = margin;
          }

          doc.setFont('helvetica','bold'); doc.setFontSize(14);
          doc.text(title, pageWidth/2, currentY, { align: 'center' });
          const titleHeight = doc.getTextDimensions(title).h;
          currentY = currentY + titleHeight + SPACING.afterSectionTitle;

          if (imgBig) {
            const boxH = 300;
            const { finalH, yPos } = await drawImageContain(doc, imgBig, margin, currentY, fullW, boxH, 'PNG');
            currentY = yPos + finalH;
            currentY += SPACING.chartToLegend;
            currentY = drawLegend(currentY);
            currentY += SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, bigChartSubTitle || title);
            currentY += SPACING.afterCaption;
          }

          if (imgSmall) {
            currentY += SPACING.betweenStacked;
            let remainingHeight = pageHeight - currentY - margin;
            if (remainingHeight < 120) { doc.addPage(); currentY = margin; remainingHeight = pageHeight - currentY - margin; }
            const { finalH, yPos } = await drawImageContain(doc, imgSmall, margin, currentY, fullW, remainingHeight, 'PNG');
            const yAfter = yPos + finalH + SPACING.legendToCaption;
            addFigureCaption(yAfter, smallChartSubTitle || title);
            currentY = yAfter;
          }

          return { page: startPage, y: currentY };
        };

        const addThreeChartsSection = async ({
          title, bigChartId, midChartId, smallChartId,
          bigChartSubTitle, midChartSubTitle, smallChartSubTitle,
          startHint
        }) => {
          const imgBig   = await getDataUrlFromChartContainer(bigChartId);
          const imgMid   = await getDataUrlFromChartContainer(midChartId);
          const imgSmall = await getDataUrlFromChartContainer(smallChartId);
          if (!imgBig && !imgMid && !imgSmall) return { page: doc.getNumberOfPages(), y: margin };

          const fullW = pageWidth - 2*margin;
          const titleHeightTmp = doc.getTextDimensions(title).h;
          const needForHeadAndBig = titleHeightTmp + SPACING.afterSectionTitle + 220 + 40; // título + gráfico grande

          // decidir onde começar
          let startPage;
          let currentY;
          if (startHint && startHint.page === doc.getNumberOfPages() && (pageHeight - startHint.y - margin) >= needForHeadAndBig) {
            startPage = startHint.page;
            currentY  = startHint.y + 4;
          } else {
            doc.addPage();
            startPage = doc.getNumberOfPages();
            currentY  = margin;
          }

          // título
          doc.setFont('helvetica','bold'); doc.setFontSize(14);
          doc.text(title, pageWidth/2, currentY, { align: 'center' });
          const titleHeight = doc.getTextDimensions(title).h;
          currentY = currentY + titleHeight + SPACING.afterSectionTitle;

          // grande
          if (imgBig) {
            const boxH = 220;
            const { finalH, yPos } = await drawImageContain(doc, imgBig, margin, currentY, fullW, boxH, 'PNG');
            currentY = yPos + finalH;
            currentY += SPACING.chartToLegend;
            currentY = drawLegend(currentY);
            currentY += SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, bigChartSubTitle || title);
            currentY += SPACING.afterCaption;
          }

          // médio
          if (imgMid) {
            currentY += SPACING.betweenStacked;
            let room = pageHeight - currentY - margin;
            const midH = 190;
            if (room < midH + 80) { doc.addPage(); currentY = margin; }
            const { finalH, yPos } = await drawImageContain(doc, imgMid, margin, currentY, fullW, midH, 'PNG');
            currentY = yPos + finalH + SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, midChartSubTitle || 'Boxplot');
            currentY += SPACING.afterCaption;
          }

          // pequeno
          if (imgSmall) {
            currentY += SPACING.betweenStacked;
            let room = pageHeight - currentY - margin;
            if (room < 120) { doc.addPage(); currentY = margin; room = pageHeight - currentY - margin; }
            const { finalH, yPos } = await drawImageContain(doc, imgSmall, margin, currentY, fullW, Math.max(140, Math.min(room, 260)), 'PNG');
            const yAfter = yPos + finalH + SPACING.legendToCaption;
            addFigureCaption(yAfter, smallChartSubTitle || 'Médias');
            currentY = yAfter;
          }

          return { page: startPage, y: currentY };
        };

        // Dimensões Gerais — com garantia de boxplot
        const addSectionDimensoesGerais = async () => {
          const imgProporcoes = await getDataUrlFromChartContainer('chart-dimensoes');
          const imgMedias     = await getDataUrlFromChartContainer('chart-medias-dimensoes');
          const imgBoxplot    = await getDataUrlFromChartContainer('chart-boxplot-dimensoes');
          if (!imgProporcoes && !imgMedias && !imgBoxplot) return { page: doc.getNumberOfPages(), y: margin };

          doc.addPage();
          const startPage = doc.getNumberOfPages();
          const title = 'Dimensões Gerais';
          doc.setFont('helvetica','bold'); doc.setFontSize(14);
          doc.text(title, pageWidth/2, margin, { align: 'center' });

          const titleHeight = doc.getTextDimensions(title).h;
          let currentY = margin + titleHeight + SPACING.afterSectionTitle;
          const fullW = pageWidth - 2*margin;

          // Proporções
          if (imgProporcoes) {
            const boxH = 300;
            const { finalH, yPos } = await drawImageContain(doc, imgProporcoes, margin, currentY, fullW, boxH, 'PNG');
            currentY = yPos + finalH;
            currentY += SPACING.chartToLegend;
            currentY = drawLegend(currentY);
            currentY += SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, `Proporções por Dimensão (${selected.ano})`);
            currentY += SPACING.afterCaption;
          }

          // Médias
          if (imgMedias) {
            const desiredH = 180;
            const room = pageHeight - currentY - margin;
            if (room < desiredH + 60) { doc.addPage(); currentY = margin + titleHeight; }
            const { finalH, yPos } = await drawImageContain(doc, imgMedias, margin, currentY, fullW, Math.max(desiredH, Math.min(room, 260)), 'PNG');
            currentY = yPos + finalH + SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, `Médias por Dimensão (${selected.ano})`);
            currentY += SPACING.afterCaption;
          }

          // Boxplot — garante altura mínima
          if (imgBoxplot) {
            const minBoxH = 160;
            let room = pageHeight - currentY - margin;
            if (room < minBoxH + 40) { doc.addPage(); currentY = margin + titleHeight; room = pageHeight - currentY - margin; }
            const targetH = Math.max(minBoxH, Math.min(room, 260));
            const { finalH, yPos } = await drawImageContain(doc, imgBoxplot, margin, currentY, fullW, targetH, 'PNG');
            currentY = yPos + finalH + SPACING.legendToCaption;
            currentY = addFigureCaption(currentY, `Boxplot das Médias por Dimensão (${selected.ano})`);
          }

          return { page: startPage, y: currentY };
        };

        // ===== TABELA: usa espaço livre e NÃO tem título; retorna cursor =====
        const addStatsTableSmart = async (tableId, hint) => {
          const img = await getDataUrlFromChartContainer(tableId);
          if (!img) return { page: doc.getNumberOfPages(), y: margin };
          const fullW = pageWidth - 2*margin;

          let pageToDraw = doc.getNumberOfPages();
          let yStart = margin;

          // tenta caber na mesma página indicada pelo hint
          if (hint && hint.page === doc.getNumberOfPages()) {
            const remaining = pageHeight - hint.y - margin;
            if (remaining >= SPACING.minFreeForTable) {
              pageToDraw = hint.page;
              yStart = hint.y + 8;
            } else {
              doc.addPage();
              pageToDraw = doc.getNumberOfPages();
              yStart = margin;
            }
          } else {
            doc.addPage();
            pageToDraw = doc.getNumberOfPages();
            yStart = margin;
          }

          const maxH = pageHeight - yStart - margin;
          const { finalH, yPos } = await drawImageContain(doc, img, margin, yStart, fullW, maxH, 'PNG');

          // devolve cursor para próxima seção usar o espaço restante
          return { page: pageToDraw, y: yPos + finalH + 10 };
        };

        // ========= laço por POLO =========
        const polosToRender = yearDef.hasPolos ? (isAllPolos ? (yearDef?.polos || []) : [selected.polo]) : [null];

        // quando não é “todos os polos”, certifica tudo carregado
        if (!isAllPolos) {
          const allIds = [...CRITICAL_CHART_IDS, ...TABLE_IDS.map(t => t.id)];
          await waitForManyCharts(allIds);
        }

        for (const poloName of polosToRender) {
          if (isAllPolos && yearDef.hasPolos) {
            await loadDashboardFor({ ano: selected.ano, curso: selected.curso, poloName });
            await sleep(500);
          }

          // Capa da seção curso/polo
          doc.addPage();
          const titulo1 = `RELATÓRIO AVALIA ${selected.ano}`;
          const campus  = poloName || 'Campus/Polo';
          const titulo2 = `${selected.curso} - ${campus}`;
          let yT = drawCenteredWrapped(titulo1, pageHeight/2 - 22, pageWidth - 2*margin, 20);
          drawCenteredWrapped(titulo2, yT + 6, pageWidth - 2*margin, 15);

          // Dimensões gerais
          const dimHint = await addSectionDimensoesGerais();
          const dimTableCursor = await addStatsTableSmart('table-stats-dimensoes', dimHint);

          // Autoavaliação (começa abaixo da tabela se couber)
          const autoHint = await addThreeChartsSection({
            title: 'Autoavaliação Discente',
            bigChartId: 'chart-proporcoes-autoav',
            midChartId: 'chart-boxplot-autoav',
            smallChartId: 'chart-medias-itens-autoav',
            bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
            midChartSubTitle: `Boxplot das Médias por Item (${selected.ano})`,
            smallChartSubTitle: `Médias dos Itens (${selected.ano})`,
            startHint: dimTableCursor,
          });
          const autoTableCursor = await addStatsTableSmart('table-stats-autoav', autoHint);

          // Atitude
          const atiHint = await addThreeChartsSection({
            title: 'Atitude Profissional',
            bigChartId: 'chart-proporcoes-atitude',
            midChartId: 'chart-boxplot-atitude',
            smallChartId: 'chart-medias-atitude',
            bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
            midChartSubTitle: `Boxplot das Médias por Item (${selected.ano})`,
            smallChartSubTitle: `Médias dos Itens (${selected.ano})`,
            startHint: autoTableCursor,
          });
          const atiTableCursor = await addStatsTableSmart('table-stats-atitude', atiHint);

          // Gestão
          const gesHint = await addThreeChartsSection({
            title: 'Gestão Didática',
            bigChartId: 'chart-proporcoes-gestao',
            midChartId: 'chart-boxplot-gestao',
            smallChartId: 'chart-medias-gestao',
            bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
            midChartSubTitle: `Boxplot das Médias por Item (${selected.ano})`,
            smallChartSubTitle: `Médias dos Itens (${selected.ano})`,
            startHint: atiTableCursor,
          });
          const gesTableCursor = await addStatsTableSmart('table-stats-gestao', gesHint);

          // Processo
          const proHint = await addThreeChartsSection({
            title: 'Processo Avaliativo',
            bigChartId: 'chart-proporcoes-processo',
            midChartId: 'chart-boxplot-processo',
            smallChartId: 'chart-medias-processo',
            bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
            midChartSubTitle: `Boxplot das Médias por Item (${selected.ano})`,
            smallChartSubTitle: `Médias dos Itens (${selected.ano})`,
            startHint: gesTableCursor,
          });
          const proTableCursor = await addStatsTableSmart('table-stats-processo', proHint);

          // Infra (começa abaixo da tabela de Processo se couber)
          const infHint = await addThreeChartsSection({
            title: 'Instalações Físicas e Recursos de TI',
            bigChartId: 'chart-proporcoes-infra',
            midChartId: 'chart-boxplot-infra',
            smallChartId: 'chart-medias-infra',
            bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
            midChartSubTitle: `Boxplot das Médias por Item (${selected.ano})`,
            smallChartSubTitle: `Médias dos Itens (${selected.ano})`,
            startHint: proTableCursor,
          });
          await addStatsTableSmart('table-stats-infra', infHint);
        }

        const baseBlob = doc.output('blob');
        const baseBytes = await baseBlob.arrayBuffer();
        let questionarioPdfPath = '/questionario_disc.pdf';
        if (selected.ano === '2025')      questionarioPdfPath = '/questionario_disc_2025.pdf';
        else if (selected.ano === '2023') questionarioPdfPath = '/questionario_disc_2023.pdf';
        const finalBlob = await mergeWithExternalPdf(baseBytes, questionarioPdfPath);
        const url = URL.createObjectURL(finalBlob);
        if (!cancelled) {
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
          prevUrlRef.current = url;
          setPdfUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        setPdfError('Não foi possível gerar o PDF. Verifique os filtros ou recarregue a página.');
        if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = ''; }
        setPdfUrl('');
      } finally {
        buildingRef.current = false;
      }
    }

    if (canGenerate && iframeReady) {
      const t = setTimeout(buildPdf, 500);
      return () => { clearTimeout(t); };
    }
  }, [canGenerate, iframeReady, selected.ano, selected.curso, selected.polo, yearDef.hasPolos, isAllPolos]);

  // cleanup URL do PDF
  useEffect(() => () => {
    if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = ''; }
  }, []);

  const downloadName = `relatorio-avalia-${selected.ano}-${selected.curso}${
    yearDef.hasPolos ? (isAllPolos ? '-todos-os-polos' : (selected.polo ? '-' + selected.polo.replace(/\s+/g, '-').toLowerCase() : '')) : ''
  }.pdf`;

  return (
    <div>
      {/* Filtros */}
      <div className={styles.filtersContainer}>
        <EadFilters
          filters={filters}
          selectedFilters={selected}
          onFilterChange={handleFilterChange}
          visibleFields={['ano', 'curso', 'polo']}
        />
      </div>

      {/* IFRAME “visível” com transparência (ajuda a evitar gráficos faltando) */}
      <iframe
        ref={chartsIframeRef}
        src={iframeSrc}
        title="Fonte dos gráficos para o PDF"
        style={{
          position: 'absolute',
          left: -99999,
          top: -99999,
          width: 1600,
          height: 2200,
          opacity: 0,
          pointerEvents: 'none'
        }}
        onLoad={() => setIframeReady(true)}
      />

      {/* Preview / Download */}
      <div style={{ marginTop: 16 }}>
        {!canGenerate ? (
          <div className={styles.errorMessage} style={{ padding: 12 }}>
            Selecione <strong>Ano</strong> e <strong>Curso</strong>
            {yearDef.hasPolos ? <> e <strong>Polo</strong></> : null}
            {' '}para gerar o PDF ao vivo.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download={downloadName}
                  className={styles.applyButton}
                >
                  Baixar PDF
                </a>
              )}
              {pdfError && <span className={styles.errorMessage} style={{ padding: 8 }}>{pdfError}</span>}
            </div>

            {pdfUrl ? (
              <iframe
                title="Preview PDF"
                src={pdfUrl}
                style={{ width: '100%', height: '80vh', border: '1px solid #333' }}
              />
            ) : !pdfError ? (
              <div className={styles.errorMessage} style={{ padding: 12 }}>
                Gerando pré-visualização… (pode demorar um pouco se for “Todos os Polos”)
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
