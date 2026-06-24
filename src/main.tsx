import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { mark, markPaint } from './utils/perf';
import './styles/fonts.css';
import './styles/global.css';

mark('js:eval'); // main bundle started executing (download + parse already paid)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

markPaint('shell:painted'); // first paint of the app shell
