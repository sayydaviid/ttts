// Adicione a importação do Suspense
import { Suspense } from 'react';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import styles from '../../../../styles/dados.module.css';
// -> CORREÇÃO: O nome do arquivo importado deve ser o mesmo do arquivo real
//    Ajustei de 'relatorio-eadead-client' para o nome que você usou no outro arquivo
import RelatorioEadClient from './relatorio-eadead-client';

const uniqSorted = (arr = []) => [...new Set((arr || []).filter(Boolean))].sort();

async function getFiltersByYear() {
  const baseDir = path.join(process.cwd(), 'src', 'app', 'banco');
  const filtersByYear = {};
  const anos = new Set();

  // 2025
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
    console.warn('Aviso 2025:', e?.message);
  }

  // 2023
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
    console.warn('Aviso 2023:', e?.message);
  }

  const anosDisponiveis = [...anos].sort((a, b) => Number(b) - Number(a));
  return { filtersByYear, anosDisponiveis };
}

// -> NOVO: Receba 'searchParams' como propriedade da página
export default async function Page({ searchParams }) {
  const { filtersByYear, anosDisponiveis } = await getFiltersByYear();

  if (!anosDisponiveis.length) {
    return (
      <div className={styles.mainContent}>
        <h1 className={styles.title}>Gerar Relatório — AVALIA EAD</h1>
        <p className={styles.errorMessage}>
          Não foi possível carregar os filtros. Verifique os CSVs em <code>src/app/banco</code>.
        </p>
      </div>
    );
  }
  
  // -> NOVO: Crie o objeto de seleção inicial a partir dos searchParams da URL
  const initialSelected = {
    ano: searchParams.ano || '',
    curso: searchParams.curso || '',
    polo: searchParams.polo || '',
  };

  return (
    <div className={styles.mainContent}>
      <h1 className={styles.title}>Gerar Relatório — AVALIA EAD</h1>
      
      {/* -> CORREÇÃO: Envolva o componente cliente com <Suspense> */}
      <Suspense fallback={<p>Carregando relatório...</p>}>
        <RelatorioEadClient
          filtersByYear={filtersByYear}
          anosDisponiveis={anosDisponiveis}
          // -> NOVO: Passe os valores iniciais lidos da URL
          initialSelected={initialSelected}
        />
      </Suspense>
    </div>
  );
}