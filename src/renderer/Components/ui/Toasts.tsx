import React from 'react';
import { CircleCheck, CircleAlert, Info } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };
type Notify = (message: string, kind?: ToastKind) => void;

const ToastContext = React.createContext<Notify>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = React.useState<Toast[]>([]);

    const notify = React.useCallback<Notify>((message, kind = 'info') => {
        const id = nextId++;
        setToasts((all) => [...all.slice(-3), { id, kind, message }]);
        window.setTimeout(
            () => setToasts((all) => all.filter((t) => t.id !== id)),
            kind === 'error' ? 6000 : 3000
        );
    }, []);

    return (
        <ToastContext.Provider value={notify}>
            {children}
            <div className="toasts">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast is-${t.kind}`}>
                        {t.kind === 'success' && <CircleCheck size={16} />}
                        {t.kind === 'error' && <CircleAlert size={16} />}
                        {t.kind === 'info' && <Info size={16} />}
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => React.useContext(ToastContext);
