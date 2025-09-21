// src/app/page.js
import React from 'react';
import styles from '../styles/page.module.css'; // Usaremos este arquivo para estilizar a página

export default function Home() {
  return (
    <section>
      <h1 className={styles.title}>Página Inicial</h1>
      <p className={styles.subtitle}>
        Bem-vindo ao site da Diretoria de Avaliação Institucional. Esse site tem o propósito de mostrar a avaliação.
      </p>

      <div className={styles.cardGrid}>
        <div className={styles.card}>
          <h2>Card de Exemplo 1</h2>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. 
            Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at 
            nibh elementum imperdiet.
          </p>
        </div>
        <div className={styles.card}>
          <h2>Card de Exemplo 2</h2>
          <p>
            Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper 
            porta. Mauris massa. Vestibulum lacinia arcu eget nulla. Class aptent 
            taciti sociosqu ad litora torquent per conubia nostra.
          </p>
        </div>
        <div className={styles.card}>
          <h2>Card de Exemplo 3</h2>
          <p>
            Per inceptos himenaeos. Curabitur sodales ligula in libero. Sed dignissim 
            lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean quam. In scelerisque 
            sem at dolor.
          </p>
        </div>
      </div>
    </section>
  );
}