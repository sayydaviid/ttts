'use client';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import styles from '../../../../styles/dados.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels);

// =======================================================
// >>>>>>>>>>>> CORREÇÃO PRINCIPAL APLICADA AQUI <<<<<<<<<<<<
// =======================================================

// 1. Adicionado 'customOptions' como uma propriedade que o componente aceita
const ActivityChart = ({ chartData, title, customOptions = {} }) => {
  
  // 2. As opções internas agora são tratadas como 'defaultOptions'
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 20
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      datalabels: {
        anchor: 'end',
        align: 'end',
        formatter: (value) => Math.round(value * 100) / 100,
        font: { size: 10 },
        color: '#444'
      }
    },
    scales: {
      x: { 
        ticks: { maxRotation: 0, minRotation: 0, autoSkip: false, font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        title: {
          display: title.includes("Proporções") || title.includes("Atividades"),
          text: 'Percentual',
          font: { size: 14 }
        },
        max: (title.includes("Proporções") || title.includes("Atividades")) ? 100 : 4
      }
    }
  };

  // 3. Mescla as opções padrão com as customizadas que vêm de fora.
  //    As opções customizadas têm prioridade e sobrescrevem as padrão.
  const finalOptions = {
    ...defaultOptions,
    ...customOptions,
    plugins: {
      ...defaultOptions.plugins,
      ...customOptions.plugins,
    },
    scales: {
      ...defaultOptions.scales,
      ...customOptions.scales,
       x: {
        ...defaultOptions.scales.x,
        ...customOptions.scales?.x,
       },
       y: {
        ...defaultOptions.scales.y,
        ...customOptions.scales?.y,
       }
    }
  };

  return (
    <div className={styles.chartWrapper}>
      <h2 className={styles.chartTitle}>{title}</h2>
      <div className={styles.chartCanvasWrapper}>
        {/* 4. Usa as 'finalOptions' mescladas no gráfico */}
        <Bar options={finalOptions} data={chartData} />
        
        {chartData.datasets.length > 1 && (
          <div className={styles.customLegend}>
            {chartData.datasets.map((dataset) => (
              <div key={dataset.label} className={styles.legendItem}>
                <span 
                  className={styles.legendColorBox} 
                  style={{ backgroundColor: dataset.backgroundColor }}
                ></span>
                <span className={styles.legendLabel}>{dataset.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityChart;