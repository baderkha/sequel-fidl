import React from 'react';
import { AppTheme, darkTheme, getTheme, getThemes, lightTheme } from './themes';

/** a theme id , or follow the OS appearance */
export type ThemePreference = 'system' | string;

const STORAGE_KEY = 'sequel-fidl.theme';

type ThemeContextValue = {
    theme: AppTheme;
    themes: AppTheme[];
    preference: ThemePreference;
    setPreference: (pref: ThemePreference) => void;
    /** temporarily show a theme (picker hover) , null restores the preference */
    preview: (pref: ThemePreference | null) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>(null);

const toVarName = (key: string) =>
    `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const readPreference = (): ThemePreference => {
    try {
        return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch (e) {
        return 'system';
    }
};

const writePreference = (pref: ThemePreference) => {
    try {
        localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {}
};

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (pref: ThemePreference, osDark: boolean): AppTheme => {
    if (pref === 'system') {
        return osDark ? darkTheme : lightTheme;
    }
    return getTheme(pref) || darkTheme;
};

/**
 * Applies the active theme as css variables on the document root
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [preference, setPref] = React.useState<ThemePreference>(readPreference);
    const [previewPref, setPreviewPref] = React.useState<ThemePreference | null>(
        null
    );
    const [osDark, setOsDark] = React.useState(() => darkQuery().matches);

    // another window changed the theme
    React.useEffect(() => {
        const onStorage = (ev: StorageEvent) => {
            if (ev.key === STORAGE_KEY) {
                setPref(ev.newValue || 'system');
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    React.useEffect(() => {
        const mq = darkQuery();
        const onChange = (ev: MediaQueryListEvent) => setOsDark(ev.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const theme = resolve(previewPref ?? preference, osDark);

    React.useLayoutEffect(() => {
        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([key, val]) =>
            root.style.setProperty(toVarName(key), val)
        );
        Object.entries(theme.syntax).forEach(([key, val]) =>
            root.style.setProperty(toVarName(`syntax-${key}`), val)
        );
        root.dataset.theme = theme.id;
        root.dataset.themeKind = theme.kind;
        root.style.colorScheme = theme.kind;
    }, [theme]);

    const value = React.useMemo<ThemeContextValue>(
        () => ({
            theme,
            themes: getThemes(),
            preference,
            setPreference: (pref) => {
                setPreviewPref(null);
                setPref(pref);
                writePreference(pref);
            },
            preview: setPreviewPref,
        }),
        [theme, preference]
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export const useTheme = () => React.useContext(ThemeContext);
