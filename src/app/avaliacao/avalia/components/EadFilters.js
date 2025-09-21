'use client';
import { useState } from 'react';
import styles from '../../../../styles/dados.module.css';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

export default function EadFilters({ filters, selectedFilters, onFilterChange }) {
  const [isOpen, setIsOpen] = useState(false);

  // Novo: esconde Polo quando ano = 2023 ou quando não há polos disponíveis
  const is2023 = selectedFilters?.ano === '2023';
  const hasPolos = Array.isArray(filters?.polos) && filters.polos.length > 0;
  const shouldShowPolo = !is2023 && hasPolos;

  // fallback seguros para map()
  const polos = hasPolos ? filters.polos : [];
  const cursos = Array.isArray(filters?.cursos) ? filters.cursos : [];
  const disciplinas = Array.isArray(filters?.disciplinas) ? filters.disciplinas : [];
  const dimensoes = Array.isArray(filters?.dimensoes) ? filters.dimensoes : [];
  const anos = Array.isArray(filters?.anos) ? filters.anos : [];

  return (
    <div className={styles.filtersWrapper}>
      <button
        className={styles.filterToggleButton}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Filter size={20} />
        <span>Filtros</span>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      <div className={`${styles.filtersContent} ${isOpen ? styles.open : ''}`}>
        {/* Filtro de Polo (escondido em 2023) */}
        {shouldShowPolo && (
          <select
            name="polo"
            value={selectedFilters.polo}
            onChange={onFilterChange}
            className={styles.filterSelect}
            aria-label="Polo"
          >
            <option value="todos">Todos os Polos</option>
            {polos.map((polo) => (
              <option key={polo} value={polo}>{polo}</option>
            ))}
          </select>
        )}

        {/* Filtro de Curso */}
        <select
          name="curso"
          value={selectedFilters.curso}
          onChange={onFilterChange}
          className={styles.filterSelect}
          aria-label="Curso"
        >
          <option value="todos">Todos os Cursos</option>
          {cursos.map((curso) => (
            <option key={curso} value={curso}>{curso}</option>
          ))}
        </select>

        {/* Filtro de Disciplina */}
        <select
          name="disciplina"
          value={selectedFilters.disciplina}
          onChange={onFilterChange}
          className={`${styles.filterSelect} ${styles.filterSelectWide}`}
          aria-label="Disciplina"
        >
          <option value="todos">Todas as Disciplinas</option>
          {disciplinas.map((disciplina) => (
            <option key={disciplina} value={disciplina}>{disciplina}</option>
          ))}
        </select>
        
        {/* ======================================================= */}
        {/* >>>>>>>>>>>> FILTROS MOVIDOS PARA O FINAL <<<<<<<<<<<< */}
        {/* ======================================================= */}

        {/* Filtro de Dimensão */}
        <select
          name="dimensao"
          value={selectedFilters.dimensao}
          onChange={onFilterChange}
          className={`${styles.filterSelect} ${styles.filterSelectWide}`}
          aria-label="Dimensão"
        >
          <option value="todos">Todas as Dimensões</option>
          {dimensoes.map((dimensao) => (
            <option key={dimensao} value={dimensao}>{dimensao}</option>
          ))}
        </select>

        {/* Filtro de Ano */}
        <select
          name="ano"
          value={selectedFilters.ano}
          onChange={onFilterChange}
          className={styles.filterSelect}
          aria-label="Ano"
        >
          {anos.map((ano) => (
            <option key={ano} value={ano}>{ano}</option>
          ))}
        </select>

      </div>
    </div>
  );
}
