import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { ToastProvider } from './Components/ui/Toasts';
import './styles/app.css';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(
    <ThemeProvider>
        <ToastProvider>
            <App />
        </ToastProvider>
    </ThemeProvider>
);
