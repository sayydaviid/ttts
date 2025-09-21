// src/app/components/Footer.js
import React from 'react';
import Link from 'next/link';
import styles from '../styles/Footer.module.css'; // Vamos criar este arquivo a seguir

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <p className={styles.copyright}>
        © {new Date().getFullYear()} DIAVI. Todos os direitos reservados.
      </p>
      <div className={styles.footerLinks}>
        <Link href="/privacidade">Política de Privacidade</Link>
      </div>
    </footer>
  );
};

export default Footer;