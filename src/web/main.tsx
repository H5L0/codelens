import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('页面缺少 #root 容器');
}
createRoot(container).render(<App />);
