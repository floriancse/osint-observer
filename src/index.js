import React from 'react';
import ReactDOM from 'react-dom/client';
// Polices hébergées avec l'app (npm i @fontsource/hanken-grotesk @fontsource/roboto-mono) :
// remplacent les @import Google Fonts de index.css, qui bloquaient le rendu
// (HTML -> CSS -> feuille Google -> fichier de police). Sous-ensemble "latin" seulement.
import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-600.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/roboto-mono/latin-400.css';
import '@fontsource/roboto-mono/latin-500.css';
import '@fontsource/roboto-mono/latin-700.css';
import "@fontsource-variable/sora";
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);