import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

const root = document.getElementById('root')!;
createRoot(root).render(<App />);
