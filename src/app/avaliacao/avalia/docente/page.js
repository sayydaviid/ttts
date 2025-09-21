// src/app/dados/discente/page.js
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import ActivityChart from '../components/ActivityChart';
import styles from '../../../../styles/dados.module.css';
// Ícones para os StatCards - você pode escolher outros se preferir
import { BookOpen, Users, Building } from 'lucide-react';

// --- FUNÇÃO PARA BUSCAR OS DADOS DA API R ---
async function getDiscenteData() {
  const urls = {
       medias: "http://localhost:8000/docente/dimensoes/medias",
    proporcoes: "http://localhost:8000/docente/dimensoes/proporcoes"
  };

  try {
    // Faz as duas chamadas à API em paralelo para mais eficiência
    const [resMedias, resProporcoes] = await Promise.all([
      fetch(urls.medias, { cache: 'no-store' }),
      fetch(urls.proporcoes, { cache: 'no-store' })
    ]);

    // Verifica se ambas as respostas foram bem-sucedidas
    if (!resMedias.ok || !resProporcoes.ok) {
      throw new Error('Falha ao buscar um ou mais dados da API R');
    }

    const mediasData = await resMedias.json();
    const proporcoesData = await resProporcoes.json();

    return { mediasData, proporcoesData };

  } catch (error) {
    console.error("Erro ao conectar com a API R:", error.message);
    // Retorna nulo para que a página possa exibir uma mensagem de erro
    return { mediasData: null, proporcoesData: null };
  }
}

// --- FUNÇÃO PARA TRANSFORMAR OS DADOS PARA O GRÁFICO ---
function formatChartData(apiData) {
  if (!apiData) return { labels: [], datasets: [] };

  const labels = [...new Set(apiData.map(item => item.dimensao))]; // ['Autoavaliação...', 'Ação Docente...', ...]
  const conceitos = [...new Set(apiData.map(item => item.conceito))]; // ['Excelente', 'Bom', ...]
  
  // Mapeamento de cores para manter a consistência com o R
  const colorMap = {
    'Excelente': 'rgba(29, 85, 111, 0.7)',  // #1D556F
    'Bom': 'rgba(40, 143, 180, 0.7)',     // #288FB4
    'Regular': 'rgba(240, 183, 117, 0.7)',// #F0B775
    'Insuficiente': 'rgba(250, 54, 10, 0.7)'// #FA360A
  }

  const datasets = conceitos.map(conceito => {
    return {
      label: conceito,
      data: labels.map(label => {
        const item = apiData.find(d => d.dimensao === label && d.conceito === conceito);
        return item ? item.valor : 0;
      }),
      backgroundColor: colorMap[conceito] || 'rgba(128, 128, 128, 0.6)',
    };
  });

  return { labels, datasets };
}


// --- O COMPONENTE DA PÁGINA ---
export default async function DiscentePage() {
  // 1. Busca os dados da API quando a página é carregada no servidor
  const { mediasData, proporcoesData } = await getDiscenteData();

  // 2. Transforma os dados de proporções para o formato do gráfico
  const discenteChartData = formatChartData(proporcoesData);

  return (
    <div>
      <Header title="Visão Geral da Avaliação Discente" />

      {/* Se os dados das médias foram carregados, mostra os cards */}
      {mediasData ? (
        <div className={styles.statsGrid}>
          <StatCard 
            title={mediasData[0].dimensao} 
            value={mediasData[0].media.toFixed(2)} 
            icon={<BookOpen />} 
          />
          <StatCard 
            title={mediasData[1].dimensao} 
            value={mediasData[1].media.toFixed(2)} 
            icon={<Users />} 
          />
          <StatCard 
            title={mediasData[2].dimensao} 
            value={mediasData[2].media.toFixed(2)} 
            icon={<Building />} 
          />
        </div>
      ) : (
        <p style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
          Não foi possível carregar os cards. A API R está online?
        </p>
      )}

      {/* Se os dados do gráfico foram carregados, mostra o gráfico */}
      {proporcoesData ? (
        <ActivityChart chartData={discenteChartData} title="Proporções de Respostas por Dimensão" />
      ) : (
        <p style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
          Não foi possível carregar o gráfico. A API R está online?
        </p>
      )}
    </div>
  );
}