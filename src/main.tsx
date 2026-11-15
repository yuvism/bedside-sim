import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadPublished } from './app/published.ts';
import './app/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
const rootEl = root;

async function start() {
  // Published cases must be in the list before the app's modules read it.
  const api: string | undefined = import.meta.env['VITE_API_URL'];
  if (api) await loadPublished(api);
  const { App } = await import('./app/App.tsx');
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
