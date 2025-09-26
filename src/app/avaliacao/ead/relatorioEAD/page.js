// src/app/avaliacao/ead/relatorioEAD/page.js

import { Suspense } from 'react';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import styles from '../../../../styles/dados.module.css';
import RelatorioEadClient from './relatorio-eadead-client'; // Nome do componente corrigido para PascalCase

const uniqSorted = (arr = []) => [...new Set((arr || []).filter(Boolean))].sort();

// Função para buscar e processar os dados dos arquivos CSV
async function getFiltersByYear() {
  const baseDir = path.join(process.cwd(), 'src', 'app', 'banco');
  const filtersByYear = {};
  const anos = new Set();

  // Processa dados de 2025
  try {
    const file2025 = path.join(baseDir, 'AUTOAVALIAÇÃO DOS CURSOS DE GRADUAÇÃO A DISTÂNCIA - 2025-2.csv');
    const csvData = fs.readFileSync(file2025, 'utf8');
    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    const data2025 = parsed.data || [];
    const polos = uniqSorted(data2025.map(r => r['Qual o seu Polo de Vinculação?']));
    const cursos = uniqSorted(data2025.map(r => r['Qual é o seu Curso?']));
    filtersByYear['2025'] = { hasPolos: polos.length > 0, polos, cursos };
    anos.add('2025');
  } catch (e) {
    console.warn('Aviso ao carregar dados de 2025:', e?.message);
  }

  // Processa dados de 2023
  try {
    const file2023 = path.join(baseDir, 'AUTOAVALIAÇÃO DOS CURSOS DE GRADUAÇÃO A DISTÂNCIA - 2023-4 .csv');
    const csv2023 = fs.readFileSync(file2023, 'utf8');
    const parsed2023 = Papa.parse(csv2023, { header: false, skipEmptyLines: true });
    const rows = parsed2023.data || [];
    if (rows.length) {
      const idxCurso = 1;
      const cursosSet = new Set();
      rows.forEach(r => {
        const c = (r?.[idxCurso] || '').toString().trim();
        if (c && !/^qual\b/i.test(c)) cursosSet.add(c);
      });
      const cursos = uniqSorted([...cursosSet]);
      filtersByYear['2023'] = { hasPolos: false, polos: [], cursos };
      anos.add('2023');
    }
  } catch (e) {
    console.warn('Aviso ao carregar dados de 2023:', e?.message);
  }

  const anosDisponiveis = [...anos].sort((a, b) => Number(b) - Number(a));
  return { filtersByYear, anosDisponiveis };
}

// NOVO COMPONENTE: Componente assíncrono para carregar dados e ler searchParams
async function RelatorioLoader({ searchParams }) {
  const { filtersByYear, anosDisponiveis } = await getFiltersByYear();

  if (!anosDisponiveis.length) {
    return (
      <p className={styles.errorMessage}>
        Não foi possível carregar os filtros. Verifique os arquivos CSV em <code>src/app/banco</code>.
      </p>
    );
  }

  // A leitura dos searchParams acontece aqui dentro
  const initialSelected = {
    ano: searchParams.ano || '',
    curso: searchParams.curso || '',
    polo: searchParams.polo || '',
  };

  return (
    <RelatorioEadClient
      filtersByYear={filtersByYear}
      anosDisponiveis={anosDisponiveis}
      initialSelected={initialSelected}
    />
  );
}


// COMPONENTE PRINCIPAL DA PÁGINA: Agora ele apenas define a estrutura e o Suspense
export default function Page({ searchParams }) {
  return (
    <div className={styles.mainContent}>
      <h1 className={styles.title}>Gerar Relatório — AVALIA EAD</h1>
      
      <Suspense fallback={<p className={styles.loadingMessage}>Carregando interface do relatório...</p>}>
        {/* O novo componente é chamado aqui, dentro do Suspense */}
        <RelatorioLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}