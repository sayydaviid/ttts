'use client';
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, FileText, ClipboardCheck, ChevronDown, ChevronUp, BookCopy, Download
} from 'lucide-react';
import styles from '../styles/Sidebar.module.css';

const Sidebar = () => {
  const pathname = usePathname();

  const featureFlags = {
    minhaOpiniaoEnabled: false,
    presencialEnabled: false,
  };

  const getInitialOpenMenus = () => {
    const initialState = { avaliacao: false, modalidade: false, dados: false };
    if (pathname.startsWith('/avaliacao/avalia') || pathname.startsWith('/avaliacao/ead')) {
      initialState.avaliacao = true;
      initialState.modalidade = true;
    }
    if (pathname.startsWith('/avaliacao/avalia')) initialState.dados = true;
    if (pathname.startsWith('/avaliacao/minhaopiniao')) initialState.avaliacao = true;
    return initialState;
  };

  const [openMenus, setOpenMenus] = useState(getInitialOpenMenus);
  useEffect(() => setOpenMenus(getInitialOpenMenus()), [pathname]);

  const handleMenuClick = (menuName) =>
    setOpenMenus(prev => ({ ...prev, [menuName]: !prev[menuName] }));

  const isAvaliacaoActive = pathname === '/avaliacao' || pathname.startsWith('/avaliacao/');
  const isModalidadeActive =
    pathname.startsWith('/avaliacao/avalia') || pathname.startsWith('/avaliacao/ead');

  const isDadosActive =
    (featureFlags.presencialEnabled && pathname.startsWith('/avaliacao/avalia')) ||
    (featureFlags.minhaOpiniaoEnabled && pathname.startsWith('/avaliacao/minhaopiniao'));

  // Mostrar o botão quando estiver em qualquer página dentro de /avaliacao
  const showGenerateButton =
    pathname === '/avaliacao' ||
    pathname.startsWith('/avaliacao/avalia') ||
    pathname.startsWith('/avaliacao/ead') ||
    pathname.startsWith('/avaliacao/minhaopiniao');

  // Destino do relatório: se estiver em EAD, aponta para o relatorioEAD.js
  const reportHref = pathname.startsWith('/avaliacao/ead')
    ? '/avaliacao/ead/relatorioEAD'
    : '/avaliacao/relatorio'; // ajuste se tiver outro caminho para presencial/minha opinião

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoContainer}>
        <Image src="/DIAVI_logo.png" alt="Logo DIAVI" width={150} height={45} priority />
      </div>

      <nav className={styles.nav}>
        <ul>
          {/* Página Inicial */}
          <li className={pathname === '/' ? styles.activeParent : ''}>
            <Link href="/" className={styles.menuHeader}>
              <Home size={18} />
              <span>Página Inicial</span>
            </Link>
          </li>

          {/* Avaliação */}
          <li className={isAvaliacaoActive ? styles.activeParent : ''}>
            <div className={styles.menuHeader} onClick={() => handleMenuClick('avaliacao')}>
              <ClipboardCheck size={18} />
              <span>Avaliação</span>
              {openMenus.avaliacao ? <ChevronUp size={16} className={styles.chevron}/> : <ChevronDown size={16} className={styles.chevron}/>}
            </div>

            {openMenus.avaliacao && (
              <ul className={styles.subMenu}>
                {/* Vai para /avaliacao/avalia (sem /discente) */}
                <li className={pathname.startsWith('/avaliacao/avalia') ? styles.subMenuItemActive : styles.subMenuItem}>
                  <Link href="/avaliacao/avalia">Avalia</Link>
                </li>

                {featureFlags.minhaOpiniaoEnabled && (
                  <li className={pathname.startsWith('/avaliacao/minhaopiniao') ? styles.subMenuItemActive : styles.subMenuItem}>
                    <Link href="/avaliacao/minhaopiniao">Minha Opinião</Link>
                  </li>
                )}
              </ul>
            )}
          </li>

          {/* Modalidade */}
          <li className={isModalidadeActive ? styles.activeParent : ''}>
            <div className={styles.menuHeader} onClick={() => handleMenuClick('modalidade')}>
              <BookCopy size={18} />
              <span>Modalidade</span>
              {openMenus.modalidade ? <ChevronUp size={16} className={styles.chevron}/> : <ChevronDown size={16} className={styles.chevron}/>}
            </div>

            {openMenus.modalidade && (
              <ul className={styles.subMenu}>
                {featureFlags.presencialEnabled && (
                  <li className={pathname.startsWith('/avaliacao/avalia') ? styles.subMenuItemActive : styles.subMenuItem}>
                    <Link href="/avaliacao/avalia/discente">Presencial</Link>
                  </li>
                )}
                <li className={pathname.startsWith('/avaliacao/ead') ? styles.subMenuItemActive : styles.subMenuItem}>
                  <Link href="/avaliacao/ead">EAD</Link>
                </li>
              </ul>
            )}
          </li>

          {/* Dados (condicional) */}
          {isDadosActive && (
            <li className={styles.activeParent}>
              <div className={styles.menuHeader} onClick={() => handleMenuClick('dados')}>
                <FileText size={18} />
                <span>Dados</span>
                {openMenus.dados ? <ChevronUp size={16} className={styles.chevron}/> : <ChevronDown size={16} className={styles.chevron}/>}
              </div>

              {openMenus.dados && (
                <ul className={styles.subMenu}>
                  {pathname.startsWith('/avaliacao/minhaopiniao') && (
                    <>
                      <li className={pathname.endsWith('/discente') ? styles.subMenuItemActive : styles.subMenuItem}>
                        <Link href="/avaliacao/minhaopiniao/discente">Discente</Link>
                      </li>
                      <li className={pathname.endsWith('/docente') ? styles.subMenuItemActive : styles.subMenuItem}>
                        <Link href="/avaliacao/minhaopiniao/docente">Docente</Link>
                      </li>
                      <li className={pathname.endsWith('/tecnico') ? styles.subMenuItemActive : styles.subMenuItem}>
                        <Link href="/avaliacao/minhaopiniao/tecnico">Técnico</Link>
                      </li>
                    </>
                  )}

                  {pathname.startsWith('/avaliacao/avalia') && (
                    <>
                      <li className={pathname.endsWith('/discente') ? styles.subMenuItemActive : styles.subMenuItem}>
                        <Link href="/avaliacao/avalia/discente">Discente</Link>
                      </li>
                      <li className={pathname.endsWith('/docente') ? styles.subMenuItemActive : styles.subMenuItem}>
                        <Link href="/avaliacao/avalia/docente">Docente</Link>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </li>
          )}
        </ul>

        {/* ===== Botão Gerar relatório (fora dos menus) ===== */}
        {showGenerateButton && (
          <div className={styles.generateReportContainer}>
            <Link href={reportHref} aria-label="Gerar relatório" className={styles.generateReportBtn}>
              <Download size={18} />
              <span>Gerar relatório</span>
            </Link>
          </div>
        )}
      </nav>
    </aside>
  );
};

export default Sidebar;



