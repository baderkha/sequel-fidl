import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { CodeEditorIFRAME } from './Components/CodeEditor/CodeEditor';
import { DBView } from './Pages/DB/DB';
import { DummyConID } from './State';

const Hello = () => {
    return (
        <div>
            <DBView></DBView>
        </div>
    );
};

export default function App() {
    const [conID, setConID] = useAtom(DummyConID);
    useEffect(() => {
        window.electron.ipcRenderer
            .invoke('init_dummy_playground', {})
            .then((res) => {
                setConID(res);
            });
    }, []);
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Hello />} />
            </Routes>
            <Routes></Routes>
        </Router>
    );
}
