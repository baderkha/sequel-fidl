import React from 'react';

export type ModalProps = {
    open: boolean;
    title: React.ReactNode;
    icon?: React.ReactNode;
    onClose: () => void;
    /** called on enter / submit button */
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
    danger?: boolean;
    wide?: boolean;
    /** extra class on the dialog */
    className?: string;
    children?: React.ReactNode;
    /** replaces the default cancel / submit footer */
    footer?: React.ReactNode;
};

export function Modal(p: ModalProps) {
    React.useEffect(() => {
        if (!p.open) {
            return undefined;
        }
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                ev.stopPropagation();
                p.onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [p.open, p.onClose]);

    if (!p.open) {
        return null;
    }
    const submit = (ev: React.FormEvent) => {
        ev.preventDefault();
        if (!p.submitDisabled && p.onSubmit) {
            p.onSubmit();
        }
    };
    return (
        <div className="backdrop" onMouseDown={p.onClose}>
            <form
                className={`modal ${p.wide ? 'is-wide' : ''} ${p.className || ''}`}
                onMouseDown={(ev) => ev.stopPropagation()}
                onSubmit={submit}
            >
                <div className="modal-header">
                    {p.icon}
                    {p.title}
                </div>
                {p.children && <div className="modal-body">{p.children}</div>}
                <div className="modal-footer">
                    {p.footer || (
                        <>
                            <button
                                type="button"
                                className="btn is-ghost"
                                onClick={p.onClose}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className={`btn ${
                                    p.danger ? 'is-danger' : 'is-primary'
                                }`}
                                disabled={p.submitDisabled}
                                autoFocus={!p.children}
                            >
                                {p.submitLabel || 'OK'}
                            </button>
                        </>
                    )}
                </div>
            </form>
        </div>
    );
}
