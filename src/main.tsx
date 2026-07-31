// main.tsx — 入口

import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<h1 style="color:red">#root not found</h1>';
} else {
  createRoot(rootEl).render(<App />);
}
