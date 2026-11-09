import { Footer } from './Footer.tsx';

export function App() {
  return (
    <>
      <header className="bar">
        <div className="brand">
          <h1>Bedside sim</h1>
          <p>Virtual patient simulator</p>
        </div>
      </header>
      <main className="page">
        <section className="card brief" aria-labelledby="soon">
          <h2 id="soon">The bedside is being built</h2>
          <p>
            Talk to the patient, examine them, order tests and treat. Their physiology responds in
            real time to what you do and to what you don’t.
          </p>
          <p>The engine and the first case arrive next. This page is the scaffold.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
