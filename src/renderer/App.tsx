import React from 'react';
import { useAtom } from 'jotai';
import { api, SessionInfo } from './api';
import { DBView } from './Pages/DB/DB';
import { Welcome } from './Pages/Welcome/Welcome';
import { SessionState } from './State';
import { useToast } from './Components/ui/Toasts';

/**
 * Every window loads this : workspace windows get their session from the main process ,
 * the launcher has none
 */
export default function App() {
    const [session, setSession] = useAtom(SessionState);
    const [ready, setReady] = React.useState(false);
    const notify = useToast();

    React.useEffect(() => {
        api.windowSession().then((s) => {
            setSession(s);
            setReady(true);
        });
    }, []);

    const openWorkspace = (s: SessionInfo) =>
        api.openWorkspace(s.conID).then((err) => err && notify(err.message, 'error'));

    if (!ready) {
        return null;
    }
    return session ? <DBView /> : <Welcome onConnected={openWorkspace} />;
}
