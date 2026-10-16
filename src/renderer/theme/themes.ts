/**
 * Theme definitions.
 *
 * A theme is a flat set of color tokens. The ThemeProvider turns every `colors` key into a css
 * variable (`surfaceRaised` => `--surface-raised`) and builds the monaco theme from `syntax`.
 * To add a theme , define another AppTheme and pass it to `registerTheme`.
 */
export type ThemeColors = {
    /** main content background (editor , grid) */
    surface: string;
    /** sidebar , toolbars */
    surfaceRaised: string;
    /** title bar , status bar */
    surfaceSunken: string;
    /** menus , dialogs , popovers */
    surfaceOverlay: string;
    hover: string;
    active: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentText: string;
    accentSoft: string;
    selection: string;
    focusRing: string;
    danger: string;
    dangerSoft: string;
    success: string;
    warning: string;
    inputBg: string;
    gridHeader: string;
    gridStripe: string;
    gridRowHover: string;
    gridRowSelected: string;
    nullText: string;
    scrollbar: string;
    scrollbarHover: string;
    shadow: string;
    backdrop: string;
};

export type SyntaxColors = {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    operator: string;
    identifier: string;
    predefined: string;
    type: string;
    delimiter: string;
};

export type AppTheme = {
    id: string;
    name: string;
    kind: 'dark' | 'light';
    colors: ThemeColors;
    syntax: SyntaxColors;
};

export const darkTheme: AppTheme = {
    id: 'dark',
    name: 'Dark',
    kind: 'dark',
    colors: {
        surface: '#181818',
        surfaceRaised: '#141414',
        surfaceSunken: '#111111',
        surfaceOverlay: '#1f1f1f',
        hover: 'rgba(255, 255, 255, 0.05)',
        active: 'rgba(255, 255, 255, 0.09)',
        border: '#262626',
        borderStrong: '#333333',
        text: '#e4e4e4',
        textMuted: '#9a9a9a',
        textFaint: '#5f5f5f',
        accent: '#228df2',
        accentText: '#ffffff',
        accentSoft: 'rgba(34, 141, 242, 0.16)',
        selection: 'rgba(34, 141, 242, 0.28)',
        focusRing: 'rgba(34, 141, 242, 0.55)',
        danger: '#f14c4c',
        dangerSoft: 'rgba(241, 76, 76, 0.14)',
        success: '#3fb950',
        warning: '#d29922',
        inputBg: '#1c1c1c',
        gridHeader: '#141414',
        gridStripe: 'rgba(255, 255, 255, 0.018)',
        gridRowHover: 'rgba(255, 255, 255, 0.04)',
        gridRowSelected: 'rgba(34, 141, 242, 0.14)',
        nullText: '#5f5f5f',
        scrollbar: 'rgba(255, 255, 255, 0.12)',
        scrollbarHover: 'rgba(255, 255, 255, 0.22)',
        shadow: '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        backdrop: 'rgba(0, 0, 0, 0.5)',
    },
    syntax: {
        keyword: '#82d2ce',
        string: '#e394dc',
        number: '#ebc88d',
        comment: '#6d6d6d',
        operator: '#d6d6dd',
        identifier: '#d6d6dd',
        predefined: '#efb080',
        type: '#87c3ff',
        delimiter: '#a0a0a0',
    },
};

export const lightTheme: AppTheme = {
    id: 'light',
    name: 'Light',
    kind: 'light',
    colors: {
        surface: '#ffffff',
        surfaceRaised: '#f7f7f7',
        surfaceSunken: '#f0f0f0',
        surfaceOverlay: '#ffffff',
        hover: 'rgba(0, 0, 0, 0.04)',
        active: 'rgba(0, 0, 0, 0.08)',
        border: '#e6e6e6',
        borderStrong: '#d4d4d4',
        text: '#1f1f1f',
        textMuted: '#6b6b6b',
        textFaint: '#a3a3a3',
        accent: '#0a6cff',
        accentText: '#ffffff',
        accentSoft: 'rgba(10, 108, 255, 0.1)',
        selection: 'rgba(10, 108, 255, 0.18)',
        focusRing: 'rgba(10, 108, 255, 0.45)',
        danger: '#d92d20',
        dangerSoft: 'rgba(217, 45, 32, 0.08)',
        success: '#1a7f37',
        warning: '#9a6700',
        inputBg: '#ffffff',
        gridHeader: '#f7f7f7',
        gridStripe: 'rgba(0, 0, 0, 0.018)',
        gridRowHover: 'rgba(0, 0, 0, 0.035)',
        gridRowSelected: 'rgba(10, 108, 255, 0.09)',
        nullText: '#b0b0b0',
        scrollbar: 'rgba(0, 0, 0, 0.14)',
        scrollbarHover: 'rgba(0, 0, 0, 0.26)',
        shadow: '0 12px 32px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.08)',
        backdrop: 'rgba(0, 0, 0, 0.2)',
    },
    syntax: {
        keyword: '#0b7285',
        string: '#b5179e',
        number: '#b45309',
        comment: '#8a8a8a',
        operator: '#3b3b3b',
        identifier: '#1f1f1f',
        predefined: '#c2410c',
        type: '#1d4ed8',
        delimiter: '#6b6b6b',
    },
};

const registry = new Map<string, AppTheme>();

/**
 * Make a theme available to the theme picker
 * @param theme
 */
export function registerTheme(theme: AppTheme) {
    registry.set(theme.id, theme);
}

export function getThemes(): AppTheme[] {
    return Array.from(registry.values());
}

export function getTheme(id: string): AppTheme | undefined {
    return registry.get(id);
}

registerTheme(darkTheme);
registerTheme(lightTheme);
