import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherApp } from '../src/teacher/TeacherApp.tsx';
import '../src/app/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <TeacherApp />
  </StrictMode>,
);
