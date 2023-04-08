import { calc } from '@chakra-ui/react';
import { LinearProgress, Typography } from '@mui/material';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { CodeEditorIFRAME } from './Components/CodeEditor/CodeEditor';
import { DBView } from './Pages/DB/DB';
import { DummyConID } from './State';

const Hello = ({ loading = true }) => {
    let [dots, setDots] = useState('.');
    let [timerId, setTimerId] = useState(null);
    if (timerId && !loading) {
        window.clearInterval(timerId);
    }
    useEffect(() => {
        console.log('setting timer');
        setTimerId(
            window.setInterval(() => {
                if (dots == '...') {
                    dots = '.';
                } else {
                    dots += '.';
                }
                setDots(dots);
            }, 1 * 1000)
        );
    }, []);
    if (!loading) {
        return (
            <div>
                <DBView></DBView>
            </div>
        );
    }
    return (
        <div
            style={{
                display: 'flex',
                alignContent: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minHeight: 'calc(100vh - 16px)',
            }}
        >
            <div
                style={{
                    width: '60%',
                    textAlign: 'center',
                }}
            >
                <LinearProgress></LinearProgress>
                <Typography
                    style={{
                        marginTop: '10px',
                    }}
                >
                    Conecting to Database {dots}
                </Typography>
            </div>
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
                <Route path="/" element={<Hello loading={!conID} />} />
            </Routes>
            <Routes></Routes>
        </Router>
    );
}
