import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { DBView } from './Pages/DB/DB';

const Hello = () => {
    return (
        <div>
            <DBView></DBView>
        </div>
    );
};

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Hello />} />
            </Routes>
        </Router>
    );
}
