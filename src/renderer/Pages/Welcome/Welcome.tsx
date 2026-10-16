import React from 'react';
import { Box, Palette, Plug } from 'lucide-react';
import { BRAND_COLOR, Logo } from 'renderer/Components/ui/Logo';
import { useTheme } from 'renderer/theme/ThemeProvider';
import type { SessionInfo } from 'renderer/api';
import { ThemePicker } from 'renderer/Components/ui/ThemePicker';
import { ConnectPane } from './ConnectPane';
import { PlaygroundsPane } from './PlaygroundsPane';

type Mode = 'connect' | 'playgrounds';
const MODE_KEY = 'sequel-fidl.welcome-mode';

const isMac = navigator.platform.toUpperCase().includes('MAC');

/**
 * First screen : connect to a server directly or use a playground
 */
export function Welcome({ onConnected }: { onConnected: (s: SessionInfo) => void }) {
    const [mode, setMode] = React.useState<Mode>(() => {
        try {
            return (localStorage.getItem(MODE_KEY) as Mode) || 'connect';
        } catch (e) {
            return 'connect';
        }
    });
    const [pickingTheme, setPickingTheme] = React.useState(false);
    const { theme } = useTheme();

    const choose = (m: Mode) => {
        setMode(m);
        try {
            localStorage.setItem(MODE_KEY, m);
        } catch (e) {}
    };

    return (
        <div className="welcome">
            <header className={`welcome-head ${isMac ? 'is-mac' : ''}`}>
                <div className="welcome-brand">
                    <Logo size={24} color={theme.kind === 'dark' ? '#a66bff' : BRAND_COLOR} />
                    <span className="welcome-title">Sequel Fidl</span>
                </div>
                <div className="segmented is-compact">
                    <button
                        type="button"
                        className={mode === 'connect' ? 'is-active' : ''}
                        onClick={() => choose('connect')}
                    >
                        <Plug size={13} /> Connect
                    </button>
                    <button
                        type="button"
                        className={mode === 'playgrounds' ? 'is-active' : ''}
                        onClick={() => choose('playgrounds')}
                    >
                        <Box size={13} /> Playgrounds
                    </button>
                </div>
                <button
                    type="button"
                    className="icon-btn welcome-theme"
                    title="Color theme"
                    onClick={() => setPickingTheme(true)}
                >
                    <Palette size={15} />
                </button>
            </header>
            {mode === 'connect' ? (
                <ConnectPane onConnected={onConnected} />
            ) : (
                <PlaygroundsPane onConnected={onConnected} />
            )}
            {pickingTheme && <ThemePicker onClose={() => setPickingTheme(false)} />}
        </div>
    );
}
