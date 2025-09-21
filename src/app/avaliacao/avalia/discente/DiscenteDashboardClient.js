'use client';

import { useState, useEffect, useMemo } from 'react';
import DiscenteFilters from '../components/DiscenteFilterAvalia';
import StatCard from '../components/StatCard';
import ActivityChart from '../components/ActivityChart';
import BoxplotChart from '../components/BoxplotChart';
import styles from '../../../../styles/dados.module.css';
import { Users, TrendingUp, TrendingDown } from 'lucide-react';

// =======================================================
// >>>>>>>>>>>> COMPONENTE DE CARREGAMENTO MELHORADO <<<<<<<<<<<<
// =======================================================
const LoadingOverlay = ({ isFullScreen = false }) => (
  <>
    {/* Styled-JSX é uma funcionalidade do Next.js para adicionar CSS diretamente no componente */}
    <style jsx global>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
    <div style={{
      position: isFullScreen ? 'fixed' : 'absolute', // Usa 'absolute' para preencher apenas o container pai
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      zIndex: 9990, // zIndex um pouco menor para overlays locais
      backdropFilter: 'blur(5px)',
      borderRadius: '8px' // Adiciona bordas arredondadas para combinar com os cards
    }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '6px solid #e0e0e0',
        borderTop: '6px solid #288FB4',
        borderRadius: '50%',
        animation: 'spin 1.2s linear infinite',
      }}></div>
    </div>
  </>
);


// ---------- Formatadores ----------
function formatProporcoesChartData(apiData) {
  if (!apiData || apiData.length === 0) return { labels: [], datasets: [] };
  const labels = [...new Set(apiData.map(item => item.dimensao))];
  const conceitos = ['Excelente', 'Bom', 'Regular', 'Insuficiente'];
  const colorMap = { 'Excelente': '#1D556F', 'Bom': '#288FB4', 'Regular': '#F0B775', 'Insuficiente': '#FA360A' };
  const datasets = conceitos.map(conceito => ({
    label: conceito,
    data: labels.map(label => (apiData.find(d => d.dimensao === label && d.conceito === conceito)?.valor || 0)),
    backgroundColor: colorMap[conceito]
  }));
  return { labels, datasets };
}

function formatMediasChartData(apiData) {
  if (!apiData || apiData.length === 0) return { labels: [], datasets: [] };
  return {
    labels: apiData.map(d => d.dimensao),
    datasets: [{
      label: 'Média',
      data: apiData.map(d => d.media),
      backgroundColor: 'rgba(40, 143, 180, 0.7)',
    }]
  };
}

function formatAtividadesChartData(apiData) {
  if (!apiData || apiData.length === 0) return { labels: [], datasets: [] };
  return {
    labels: apiData.map(d => d.atividade),
    datasets: [{
      label: 'Percentual de Participação',
      data: apiData.map(d => d.percentual),
      backgroundColor: 'rgba(40, 143, 180, 0.7)'
    }]
  };
}

function formatProporcoesItensChartData(apiData) {
  if (!apiData || apiData.length === 0) return { labels: [], datasets: [] };
  const labels = [...new Set(apiData.map(item => item.item))].sort();
  const conceitos = ['Excelente', 'Bom', 'Regular', 'Insuficiente'];
  const colorMap = { 'Excelente': '#1D556F', 'Bom': '#288FB4', 'Regular': '#F0B775', 'Insuficiente': '#FA360A' };
  const datasets = conceitos.map(conceito => ({
    label: conceito,
    data: labels.map(label => (apiData.find(d => d.item === label && d.conceito === conceito)?.valor || 0)),
    backgroundColor: colorMap[conceito]
  }));
  return { labels, datasets };
}

function formatMediasItensChartData(apiData) {
  if (!apiData || apiData.length === 0) return { labels: [], datasets: [] };
  return {
    labels: apiData.map(d => d.item).sort(),
    datasets: [{
      label: 'Média',
      data: apiData.map(d => d.media),
      backgroundColor: 'rgba(40, 143, 180, 0.7)',
    }]
  };
}

export default function DiscenteDashboardClient({ initialData, filtersOptions }) {
  const [activeTab, setActiveTab] = useState('dimensoes');
  const [selectedFilters, setSelectedFilters] = useState({ campus: 'todos', curso: 'todos' });
  
  const [summaryData, setSummaryData] = useState(initialData.summary);
  const [dashboardData, setDashboardData] = useState({
      proporcoes: initialData.proporcoes,
      boxplot: initialData.boxplot,
      atividades: initialData.atividades,
      medias: initialData.medias
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [itensAutoProp, setItensAutoProp] = useState(null);
  const [itensAutoMed, setItensAutoMed] = useState(null);
  const [itensAutoBox, setItensAutoBox] = useState(null);
  const [isItensLoading, setIsItensLoading] = useState(false);
  
  const [itensAtitudeMed, setItensAtitudeMed] = useState(null);
  const [itensGestaoMed, setItensGestaoMed] = useState(null);
  const [itensProcessoMed, setItensProcessoMed] = useState(null);
  const [itensInstalacoesMed, setItensInstalacoesMed] = useState(null);
  const [itensInstalacoesProp, setItensInstalacoesProp] = useState(null);

  // EFEITO 1: Busca os dados GERAIS e de RESUMO quando os filtros mudam.
  useEffect(() => {
    const fetchGeneralData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(selectedFilters).toString();
        const urls = {
          summary: `http://localhost:8000/discente/geral/summary?${params}`,
          medias: `http://localhost:8000/discente/dimensoes/medias?${params}`,
          proporcoes: `http://localhost:8000/discente/dimensoes/proporcoes?${params}`,
          boxplot: `http://localhost:8000/discente/dimensoes/boxplot?${params}`,
          atividades: `http://localhost:8000/discente/atividades/percentual?${params}`,
        };

        const responses = await Promise.all(Object.values(urls).map(url => fetch(url)));
        for (const res of responses) {
          if (!res.ok) throw new Error("Falha ao buscar dados filtrados da API R");
        }
        
        const [summary, medias, proporcoes, boxplot, atividades] = await Promise.all(responses.map(res => res.json()));
        setSummaryData(summary);
        setDashboardData({ medias, proporcoes, boxplot, atividades });

      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGeneralData();
  }, [selectedFilters]);

  // EFEITO 2: Busca os dados DETALHADOS conforme a aba ativa.
  useEffect(() => {
    const params = new URLSearchParams(selectedFilters).toString();
    const endpointMap = {
      autoavaliacao: {
        propItens: `http://localhost:8000/discente/autoavaliacao/itens/proporcoes?${params}`,
        medItens: `http://localhost:8000/discente/autoavaliacao/itens/medias?${params}`,
        boxItens: `http://localhost:8000/discente/autoavaliacao/itens/boxplot?${params}`,
      },
      atitude: { medItens: `http://localhost:8000/discente/atitudeprofissional/itens/medias?${params}` },
      gestao: { medItens: `http://localhost:8000/discente/gestaodidatica/itens/medias?${params}` },
      processo: { medItens: `http://localhost:8000/discente/processoavaliativo/itens/medias?${params}` },
      instalacoes: { 
        medItens: `http://localhost:8000/discente/instalacoes/itens/medias?${params}`,
        propItens: `http://localhost:8000/discente/instalacoes/itens/proporcoes?${params}`
      },
    };

    const fetchDataForTab = async (tabKey) => {
      const urls = endpointMap[tabKey];
      if (!urls) return;

      setIsItensLoading(true);
      setError(null);
      try {
        if (tabKey === 'autoavaliacao') {
          const responses = await Promise.all(Object.values(urls).map(url => fetch(url)));
          for (const res of responses) { if (!res.ok) throw new Error("Falha ao buscar dados detalhados da API R"); }
          const [propI, medI, boxI] = await Promise.all(responses.map(res => res.json()));
          setItensAutoProp(propI);
          setItensAutoMed(medI);
          setItensAutoBox(boxI);
        } else if (tabKey === 'instalacoes') {
          const responses = await Promise.all(Object.values(urls).map(url => fetch(url)));
          for (const res of responses) { if (!res.ok) throw new Error("Falha ao buscar dados de instalações"); }
          const [medI, propI] = await Promise.all(responses.map(res => res.json()));
          setItensInstalacoesMed(medI);
          setItensInstalacoesProp(propI);
        } else {
          const response = await fetch(urls.medItens);
          if (!response.ok) throw new Error(`Falha ao buscar dados para ${tabKey}`);
          const data = await response.json();
          if (tabKey === 'atitude') setItensAtitudeMed(data);
          if (tabKey === 'gestao') setItensGestaoMed(data);
          if (tabKey === 'processo') setItensProcessoMed(data);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsItensLoading(false);
      }
    };

    if (endpointMap[activeTab]) {
      fetchDataForTab(activeTab);
    }
  }, [activeTab, selectedFilters]);
  
  const datasets = useMemo(() => {
    return {
      proporcoes: formatProporcoesChartData(dashboardData.proporcoes),
      medias:     formatMediasChartData(dashboardData.medias),
      atividades: formatAtividadesChartData(dashboardData.atividades),
    };
  }, [dashboardData]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setSelectedFilters(prev => ({ ...prev, [name]: value }));
  };

  const tabs = [
    { key: 'dimensoes',     label: 'Dimensões Gerais' },
    { key: 'autoavaliacao', label: 'Autoavaliação Discente' },
    { key: 'atividades',    label: 'Atividades Acadêmicas' },
    { key: 'atitude',       label: 'Atitude Profissional' },
    { key: 'gestao',        label: 'Gestão Didática' },
    { key: 'processo',      label: 'Processo Avaliativo' },
    { key: 'instalacoes',   label: 'Instalações Físicas' },
  ];

  return (
    <>
      {(isLoading) && <LoadingOverlay isFullScreen={true} />}
      
      <div>
        {error && <p className={styles.errorMessage}>{error}</p>}
        
        {!error && (
          <>
            <div className={styles.statsGrid}>
              <StatCard 
                title="Total de Respondentes" 
                value={summaryData?.total_respondentes?.[0] ?? '...'} 
                icon={<Users />} 
              />
              <StatCard 
                title="Campus Melhor Avaliado" 
                value={summaryData?.campus_melhor_avaliado?.campus?.[0] ?? '...'} 
                subtitle={`Média: ${summaryData?.campus_melhor_avaliado?.media?.[0] ?? 'N/A'}`}
                icon={<TrendingUp />} 
              />
              <StatCard 
                title="Campus Pior Avaliado" 
                value={summaryData?.campus_pior_avaliado?.campus?.[0] ?? '...'}
                subtitle={`Média: ${summaryData?.campus_pior_avaliado?.media?.[0] ?? 'N/A'}`}
                icon={<TrendingDown />} 
              />
            </div>

            <div style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
              <DiscenteFilters
                filters={filtersOptions}
                selectedFilters={selectedFilters}
                onFilterChange={handleFilterChange}
              />
            </div>

            <div>
              <div className={styles.tabsContainer} style={{ flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                  <button key={tab.key} className={activeTab === tab.key ? styles.activeTab : styles.tab} onClick={() => setActiveTab(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className={styles.chartDisplayArea}>
                {activeTab === 'dimensoes' && (
                  <div className={styles.dashboardLayout}>
                    <div className={styles.chartContainer}>{isItensLoading ? <LoadingOverlay/> : <ActivityChart chartData={datasets.proporcoes} title="Proporções de respostas por Dimensão" />}</div>
                    <div className={styles.sideCharts}>
                      <div className={styles.chartContainer}>{isItensLoading ? <LoadingOverlay/> : <ActivityChart chartData={datasets.medias} title="Médias por Dimensão" customOptions={{ plugins: { legend: { display: false } } }} />}</div>
                      <div className={styles.chartContainer}>{isItensLoading ? <LoadingOverlay/> : (dashboardData.boxplot ? <BoxplotChart apiData={dashboardData.boxplot} title="Distribuição das Médias das Avaliações" /> : <p>Carregando...</p>)}</div>
                    </div>
                  </div>
                )}

                {activeTab === 'autoavaliacao' && (
                  <div style={{position: 'relative'}}>
                    {isItensLoading && <LoadingOverlay/>}
                    <div>
                      <div className={styles.chartContainer} style={{ marginBottom: '1rem', height: '500px' }}>{itensAutoProp ? <ActivityChart chartData={formatProporcoesItensChartData(itensAutoProp)} title="Proporções de respostas dadas aos itens relacionados à Autoavaliação Discente" /> : <p>Dados de proporções não disponíveis.</p>}</div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <div className={styles.chartContainer} style={{ flex: 1, height: '400px' }}>{itensAutoMed ? <ActivityChart chartData={formatMediasItensChartData(itensAutoMed)} title="Médias dos itens relacionados à Autoavaliação Discente" customOptions={{ plugins: { legend: { display: false } } }} /> : <p>Dados de médias não disponíveis.</p>}</div>
                        <div className={styles.chartContainer} style={{ flex: 1, height: '400px' }}>{itensAutoBox ? <BoxplotChart apiData={itensAutoBox} title="Boxplot Discente" /> : <p>Dados de boxplot não disponíveis.</p>}</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'atividades' && <div className={styles.chartContainer} style={{position: 'relative'}}>{isItensLoading ? <LoadingOverlay/> : <ActivityChart chartData={datasets.atividades} title="Percentual de Participação em Atividades" customOptions={{ scales: { x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: false } } } }} />}</div>}
                
                {activeTab === 'atitude' && (
                    <div className={styles.chartContainer} style={{position: 'relative'}}>
                        {isItensLoading ? <LoadingOverlay/> : (itensAtitudeMed ? <ActivityChart chartData={formatMediasItensChartData(itensAtitudeMed)} title="Médias dos itens relacionados à Atitude Profissional (Discente)" customOptions={{ plugins: { legend: { display: false } }, scales: { y: { max: 4 } } }} /> : <p>Dados não disponíveis.</p>)}
                    </div>
                )}

                {activeTab === 'gestao' && (
                  <div className={styles.chartContainer} style={{position: 'relative'}}>
                    {isItensLoading ? <LoadingOverlay/> : (itensGestaoMed ? <ActivityChart chartData={formatMediasItensChartData(itensGestaoMed)} title="Médias dos itens relacionados à Gestão Didática (Discente)" customOptions={{ plugins: { legend: { display: false } }, scales: { y: { max: 4 } } }} /> : <p>Dados não disponíveis.</p>)}
                  </div>
                )}

                {activeTab === 'processo' && (
                  <div className={styles.chartContainer} style={{position: 'relative'}}>
                    {isItensLoading ? <LoadingOverlay/> : (itensProcessoMed ? <ActivityChart chartData={formatMediasItensChartData(itensProcessoMed)} title="Médias dos itens relacionados ao Processo Avaliativo (Discente)" customOptions={{ plugins: { legend: { display: false } }, scales: { y: { max: 4 } } }} /> : <p>Dados não disponíveis.</p>)}
                  </div>
                )}
                
                {activeTab === 'instalacoes' && (
                  <div style={{position: 'relative'}}>
                    {isItensLoading && <LoadingOverlay/>}
                    {/* ======================================================= */}
                    {/* >>>>>>>>>>>> LAYOUT E ALTURA ATUALIZADOS <<<<<<<<<<<< */}
                    {/* ======================================================= */}
                    <div className={styles.dashboardLayout}>
                      <div className={styles.chartContainer} style={{ height: '550px' }}>
                        {itensInstalacoesProp ? <ActivityChart chartData={formatProporcoesItensChartData(itensInstalacoesProp)} title="Proporções de respostas dadas aos itens relacionados às Instalações Físicas (Discente)" /> : <p>Dados não disponíveis.</p>}
                      </div>
                      <div className={styles.sideCharts} style={{ height: '550px' }}>
                        <div className={styles.chartContainer}>
                          {itensInstalacoesMed ? <ActivityChart chartData={formatMediasItensChartData(itensInstalacoesMed)} title="Médias dos itens relacionados às Instalações Físicas (Discente)" customOptions={{ plugins: { legend: { display: false } }, scales: { y: { max: 4 } } }} /> : <p>Dados não disponíveis.</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}