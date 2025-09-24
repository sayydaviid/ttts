'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EadFilters from '../../avalia/components/EadFilters';
import styles from '../../../../styles/dados.module.css';

export default function RelatorioEadClient({ filtersByYear, anosDisponiveis, initialSelected }) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const filters = useMemo(() => ({
    anos: anosDisponiveis,
    cursos: selected.ano ? (yearDef.cursos || []) : [],
    polos: (selected.ano && yearDef.hasPolos) ? (yearDef.polos || []) : [],
    disciplinas: [],
    dimensoes: [],
  }), [anosDisponiveis, selected.ano, yearDef]);

  const syncURL = (next) => {
    const sp = new URLSearchParams(searchParams.toString());
    next.ano ? sp.set('ano', next.ano) : sp.delete('ano');
    next.curso ? sp.set('curso', next.curso) : sp.delete('curso');
    if (next.ano && filtersByYear[next.ano]?.hasPolos && next.polo) sp.set('polo', next.polo);
    else sp.delete('polo');
    router.replace(sp.toString() ? `?${sp.toString()}` : '?');
  };

  const handleFilterChange = (e) => {
    const key = e?.target?.name;
    const value = e?.target?.value ?? '';
    const next = { ...selected, [key]: value };
    if (key === 'ano') { next.curso = ''; next.polo = ''; }
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

  // gráficos só geram se Ano+Curso (e Polo quando existir)
  const canGenerate = !!selected.ano && !!selected.curso && (!yearDef.hasPolos || !!selected.polo);

  // ========= IFRAME COM O DASHBOARD (fonte dos gráficos) =========
  const chartsIframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);

  const iframeSrc = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('ano', selected.ano || '');
    sp.set('curso', selected.curso || '');
    if (yearDef.hasPolos && selected.polo) sp.set('polo', selected.polo);
    sp.set('embedForPdf', '1');
    return `/avaliacao/ead?${sp.toString()}`;
  }, [selected.ano, selected.curso, selected.polo, yearDef.hasPolos]);

  useEffect(() => { setIframeReady(false); }, [iframeSrc]);

  // ============= helpers comuns =============
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const getDocAnywhere = () => {
    const ifr = chartsIframeRef.current;
    const iframeDoc = ifr?.contentWindow?.document || ifr?.contentDocument || null;
    return { main: document, iframe: iframeDoc };
  };

  const fetchAsDataUrl = async (url) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  };

  const loadImg = (src) =>
    new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ im, w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
      im.onerror = reject;
      im.src = src;
    });

  const drawImageContain = async (doc, dataUrl, boxX, boxY, boxW, boxH, fmt = 'PNG') => {
    const { w, h } = await loadImg(dataUrl);
    const scale = Math.min(boxW / w, boxH / h);
    const drawW = w * scale;
    const drawH = h * scale;
    const x = boxX + (boxW - drawW) / 2;
    const y = boxY + (boxH - drawH) / 2;
    doc.addImage(dataUrl, fmt, x, y, drawW, drawH, undefined, 'FAST');
  };

  const queryAnywhere = (selector) => {
    const { main, iframe } = getDocAnywhere();
    return main.querySelector(selector) || iframe?.querySelector(selector) || null;
  };

  const waitForChart = async (containerId, timeoutMs = 5000) => {
    const start = performance.now();
    const selector = `#${containerId}`;
    while (performance.now() - start < timeoutMs) {
      const el = queryAnywhere(selector);
      if (el) {
        const canvas = el.querySelector('canvas');
        if (canvas && canvas.width > 0 && canvas.height > 0) return el;
        const svg = el.querySelector('svg');
        if (svg) return el;
      }
      await sleep(120);
    }
    return null;
  };

  const getDataUrlFromChartContainer = async (containerId) => {
    const el = await waitForChart(containerId);
    if (!el) return null;

    const canvas = el.querySelector('canvas');
    if (canvas) {
      try { return canvas.toDataURL('image/png'); } catch {}
    }

    const svg = el.querySelector('svg');
    if (svg) {
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
      return c.toDataURL('image/png');
    }

    return null;
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

  // =================== buildPdf ===================
  useEffect(() => {
    let cancelled = false;

    async function buildPdf() {
      setPdfError('');
      if (!canGenerate || !iframeReady) {
        if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = ''; }
        setPdfUrl(''); return;
      }

      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        let y = margin;

        // ===== helpers visuais =====
        const LEGENDA_ITEMS = [
          { label: 'Excelente',    color: '#1D556F' },
          { label: 'Bom',          color: '#288FB4' },
          { label: 'Regular',      color: '#F0B775' },
          { label: 'Insuficiente', color: '#FA360A' },
        ];

        // Legenda compacta, com quebra automática e "colchão" abaixo
        const drawLegend = (
          yLegend,
          items = LEGENDA_ITEMS,
          {
            fontSize = 9,
            box = 8,
            textGap = 4,
            itemGap = 8,
            rowGap = 8,       // mais espaço entre linhas da legenda
            bottomGap = 12,   // colchão DEPOIS da legenda
            maxWidth = null,
            left = 40,
            right = 40,
          } = {}
        ) => {
          doc.setFont('helvetica','normal');
          doc.setFontSize(fontSize);
          doc.setTextColor(0,0,0);

          const usable = (maxWidth ?? (pageWidth - left - right));
          const lines = [[]];
          let lineW = 0;

          items.forEach((it) => {
            const labelW = doc.getTextWidth(it.label);
            const w = box + textGap + labelW;
            const addW = (lines[lines.length-1].length ? itemGap : 0) + w;

            if (lineW + addW > usable && lines[lines.length-1].length) {
              lines.push([it]); lineW = w;
            } else {
              lines[lines.length-1].push(it); lineW += addW;
            }
          });

          lines.forEach((row, idx) => {
            const rowW = row.reduce((acc, it, i) => {
              const labelW = doc.getTextWidth(it.label);
              return acc + (i ? itemGap : 0) + (box + textGap + labelW);
            }, 0);

            let x = (pageWidth - rowW) / 2;
            row.forEach((it) => {
              doc.setFillColor(it.color);
              doc.rect(x, yLegend - box + (fontSize >= 10 ? 2 : 1), box, box, 'F');
              x += box + textGap;
              doc.text(it.label, x, yLegend);
              x += doc.getTextWidth(it.label) + itemGap;
            });

            if (idx < lines.length - 1) yLegend += fontSize + rowGap;
          });

          return yLegend + fontSize + bottomGap;
        };

        // Caption com margem acima e abaixo
        let FIG_NO = 1;
        const addFigureCaption = (yCap, caption, {top = 6, bottom = 18, size = 10} = {}) => {
          if (!caption) return yCap;
          yCap += top; // espaço antes
          doc.setFont('helvetica','normal');
          doc.setFontSize(size);
          doc.setTextColor(0,0,0);
          const text = `Figura ${FIG_NO} — ${caption}`;
          doc.text(text, pageWidth/2, yCap, { align:'center' });
          FIG_NO += 1;
          return yCap + bottom; // espaço depois
        };
        // ============================================

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
        y += 24;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
        const paragraphs = [
          'A Autoavaliação dos Cursos de Graduação a Distância da UFPA (AVALIA EAD) é coordenada pela Comissão Própria de Avaliação (CPA), em parceria com a Diretoria de Avaliação Institucional (DIAVI/PROPLAN).',
          'O AVALIA-EAD foi elaborado com o intuito de conhecer a percepção dos discentes sobre o seu curso de graduação a distância, de modo a contribuir para a implementação de avanços qualitativos nas condições de ensino e aprendizagem.',
          'O formulário do AVALIA-EAD contempla três dimensões inter-relacionadas que correspondem a: Autoavaliação discente (Dimensão 1); Avaliação da Ação Docente (Dimensão 2), com três subdimensões (Atitude Profissional, Gestão Didática e Processo Avaliativo); e Instalações Físicas e Recursos de TI (Dimensão 3).',
          'No presente relatório, a CPA divulga os resultados da aplicação do AVALIA EAD, referente às atividades curriculares desenvolvidas no Período Letivo 2025-2. Os ítens abordados possibilitam avaliar cada atividade curricular realizada no período letivo, com respeito à três Dimensões supracitadas, com base em uma escala de 1 (Insuficiente) a 4 (Excelente). Alguns itens possuem a alternativa Não se Aplica.',
          'Para a análise das respostas dos discentes, foram utilizadas duas representações gráficas principais: gráficos de barras e boxplots. Os gráficos de barras apresentam o percentual de respostas e a média das respostas, tanto por dimensão como por ítem. Já os boxplots mostram a distribuição das médias de avaliação por disciplina/docente. Essa representação permite visualizar a tendência central das avaliações realizadas pelos discentes, bem como identificar possíveis valores atípicos (outliers) em relação ao conjunto geral de respostas, conforme ilustrado na figura a seguir.',
        ];
        for (let i=0;i<paragraphs.length;i++){
          const lines = doc.splitTextToSize(paragraphs[i], pageWidth - 2*margin);
          doc.text(lines, margin, y); y += lines.length*14 + 8;
          if (i===3) y += 6;
          if (y > pageHeight - margin - 220 && i < paragraphs.length - 1) { doc.addPage(); y = margin; }
        }

        // figura boxplot (imagem estática)
        try {
          const boxplotInfo = await fetchAsDataUrl('/boxplot.jpeg');
          const boxMaxW = pageWidth - 2*margin, boxMaxH = 260;
          const spaceLeft = pageHeight - y - margin;
          if (spaceLeft < boxMaxH + 20) { doc.addPage(); y = margin; }
          await drawImageContain(doc, boxplotInfo, margin, y, boxMaxW, boxMaxH, 'JPEG');
          y = addFigureCaption(y + boxMaxH + 12, 'Exemplo de Boxplot');
        } catch {}

        // TÍTULO dinâmico
        doc.addPage(); doc.setFont('helvetica','bold');
        const campus = selected.polo || 'Campus/Polo';
        const titulo1 = `RELATÓRIO AVALIA ${selected.ano}`;
        const titulo2 = `${selected.curso} - ${campus}`;
        const drawCenteredWrapped = (text, y0, maxWidth, size) => {
          doc.setFontSize(size);
          const lines = doc.splitTextToSize(text, maxWidth);
          doc.text(lines, pageWidth/2, y0, { align: 'center' });
          const lh = size*0.6 + 6; return y0 + lines.length*lh;
        };
        y = drawCenteredWrapped(titulo1, pageHeight/2 - 24, pageWidth - 2*margin, 21);
        y = drawCenteredWrapped(titulo2, y + 10, pageWidth - 2*margin, 16);

        // ====== utils de seção ======
        const addTwoChartsSection = async ({
          title,
          bigChartId, smallChartId,
          bigChartSubTitle, smallChartSubTitle,
        }) => {
          const imgBig = await getDataUrlFromChartContainer(bigChartId);
          const imgSmall = await getDataUrlFromChartContainer(smallChartId);
          if (!imgBig && !imgSmall) return;

          doc.addPage();
          doc.setFont('helvetica','bold'); doc.setFontSize(15);
          doc.text(title, pageWidth/2, margin, { align: 'center' });

          const topY = margin + 18;
          const fullW = pageWidth - 2*margin;
          const gap = 14;

          // BIG (proporções)
          if (imgBig) {
            const bigH = 320;
            await drawImageContain(doc, imgBig, margin, topY, fullW, bigH, 'PNG');
            let yAfter = drawLegend(topY + bigH + 6);
            yAfter = addFigureCaption(yAfter, bigChartSubTitle || title);
          }

          // SMALL (médias) – mais folga do bloco acima
          if (imgSmall) {
            const belowY = topY + 320 + 56;
            const smallH = Math.max(160, pageHeight - belowY - margin - gap);
            await drawImageContain(doc, imgSmall, margin, belowY, fullW, smallH, 'PNG');
            addFigureCaption(belowY + smallH + 8, smallChartSubTitle || title);
          }
        };

        const addThreeChartsSection = async ({
          title,
          bigChartId, midChartId, smallChartId,
          bigChartSubTitle, midChartSubTitle, smallChartSubTitle,
        }) => {
          const imgBig   = await getDataUrlFromChartContainer(bigChartId);
          const imgMid   = await getDataUrlFromChartContainer(midChartId);
          const imgSmall = await getDataUrlFromChartContainer(smallChartId);
          if (!imgBig && !imgMid && !imgSmall) return;

          doc.addPage();
          doc.setFont('helvetica','bold'); doc.setFontSize(15);
          doc.text(title, pageWidth/2, margin, { align: 'center' });

          const gap = 12;
          const areaTopY = margin + 18;
          const fullW = pageWidth - 2*margin;

          // 1) Proporções (grande)
          if (imgBig) {
            const propH = 240;
            await drawImageContain(doc, imgBig, margin, areaTopY, fullW, propH, 'PNG');
            let yAfter = drawLegend(areaTopY + propH + 6);
            yAfter = addFigureCaption(yAfter, bigChartSubTitle || title);
          }

          // 2) Boxplot (meio) – mais folga
          const midY = areaTopY + 240 + 48;
          if (imgMid) {
            const midH = 200;
            await drawImageContain(doc, imgMid, margin, midY, fullW, midH, 'PNG');
            addFigureCaption(midY + midH + 8, midChartSubTitle || 'Boxplot');
          }

          // 3) Médias (baixo) – mais folga
          const smallY = areaTopY + 240 + 48 + 200 + gap + 14;
          if (imgSmall) {
            const smallH = Math.max(140, pageHeight - smallY - margin);
            await drawImageContain(doc, imgSmall, margin, smallY, fullW, smallH, 'PNG');
            addFigureCaption(smallY + smallH + 8, smallChartSubTitle || 'Médias');
          }
        };

        // ====== Dimensões Gerais (3 gráficos, com legenda) ======
        const addSectionDimensoesGerais = async () => {
          const imgProporcoes = await getDataUrlFromChartContainer('chart-dimensoes');
          const imgMedias     = await getDataUrlFromChartContainer('chart-medias-dimensoes');
          const imgBoxplot    = await getDataUrlFromChartContainer('chart-boxplot-dimensoes');

          if (!imgProporcoes && !imgMedias && !imgBoxplot) return;

          doc.addPage();
          doc.setFont('helvetica','bold');
          doc.setFontSize(15);
          doc.text('Dimensões Gerais', pageWidth/2, margin, { align: 'center' });

          const gap = 12;
          const areaTopY = margin + 18;
          const fullW = pageWidth - 2*margin;

          // 1) Proporções (grande)
          const propH = 320;
          if (imgProporcoes) {
            await drawImageContain(doc, imgProporcoes, margin, areaTopY, fullW, propH, 'PNG');
            let yAfter = drawLegend(areaTopY + propH + 6);
            yAfter = addFigureCaption(yAfter, `Proporções por Dimensão (${selected.ano})`);
          }

          // 2) Médias e 3) Boxplot empilhados – mais folga
          const belowY = areaTopY + propH + 56;
          const smallH = Math.floor((pageHeight - belowY - margin - gap) / 2);

          if (imgMedias) {
            await drawImageContain(doc, imgMedias, margin, belowY, fullW, smallH, 'PNG');
            addFigureCaption(belowY + smallH + 8, `Médias por Dimensão (${selected.ano})`);
          }

          if (imgBoxplot) {
            const y2 = belowY + smallH + gap + 10;
            const h2 = Math.max(140, pageHeight - y2 - margin);
            await drawImageContain(doc, imgBoxplot, margin, y2, fullW, h2, 'PNG');
            addFigureCaption(y2 + h2 + 8, `Boxplot das Médias por Dimensão (${selected.ano})`);
          }
        };

        // ====== Seções ======
        await addSectionDimensoesGerais();

        // Autoavaliação: 3 gráficos
        await addThreeChartsSection({
          title: 'Autoavaliação Discente',
          bigChartId: 'chart-proporcoes-autoav',
          midChartId: 'chart-boxplot-autoav',
          smallChartId: 'chart-medias-itens-autoav',
          bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
          midChartSubTitle: 'Boxplot Discente',
          smallChartSubTitle: `Médias dos Itens relacionados à Autoavaliação Discente (${selected.ano})`,
        });

        // Atitude Profissional: 2 gráficos
        await addTwoChartsSection({
          title: 'Atitude Profissional',
          bigChartId: 'chart-proporcoes-atitude',
          smallChartId: 'chart-medias-atitude',
          bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
          smallChartSubTitle: 'Médias dos Itens relacionados à Atitude Profissional (Discente)',
        });

        // Gestão Didática: 2 gráficos
        await addTwoChartsSection({
          title: 'Gestão Didática',
          bigChartId: 'chart-proporcoes-gestao',
          smallChartId: 'chart-medias-gestao',
          bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
          smallChartSubTitle: 'Médias dos Itens relacionados à Gestão Didática (Discente)',
        });

        // Processo Avaliativo: 2 gráficos
        await addTwoChartsSection({
          title: 'Processo Avaliativo',
          bigChartId: 'chart-proporcoes-processo',
          smallChartId: 'chart-medias-processo',
          bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
          smallChartSubTitle: 'Médias dos Itens relacionados ao Processo Avaliativo (Discente)',
        });

        // Instalações Físicas e Recursos de TI: 2 gráficos
        await addTwoChartsSection({
          title: 'Instalações Físicas e Recursos de TI',
          bigChartId: 'chart-proporcoes-infra',
          smallChartId: 'chart-medias-infra',
          bigChartSubTitle: `Proporções de Respostas por Item (${selected.ano})`,
          smallChartSubTitle: 'Médias dos Itens relacionados às Instalações Físicas e Recursos de TI (Discente)',
        });

        // exporta e anexa questionário
        const baseBlob = doc.output('blob');
        const baseBytes = await baseBlob.arrayBuffer();
        const finalBlob = await mergeWithExternalPdf(baseBytes, '/questionario_disc.pdf');

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
      }
    }

    if (canGenerate && iframeReady) {
      const t = setTimeout(buildPdf, 400);
      return () => { clearTimeout(t); };
    }
  }, [canGenerate, iframeReady, selected.ano, selected.curso, selected.polo, yearDef.hasPolos]);

  // cleanup URL do PDF
  useEffect(() => () => {
    if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = ''; }
  }, []);

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

      {/* IFRAME invisível que carrega o dashboard e fornece os gráficos */}
      <iframe
        ref={chartsIframeRef}
        src={iframeSrc}
        title="Fonte dos gráficos para o PDF"
        style={{ position: 'absolute', left: -99999, top: -99999, width: 1600, height: 2000, visibility: 'hidden' }}
        onLoad={() => setIframeReady(true)}
      />

      {/* Preview/Download */}
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
                  download={`relatorio-avalia-${selected.ano}-${selected.curso}${selected.polo ? '-' + selected.polo : ''}.pdf`}
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
                Gerando pré-visualização…
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
