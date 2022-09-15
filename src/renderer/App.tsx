import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { TablePage } from './Pages/DB/TablePage';

const Hello = () => {
    return (
        <div>
            <TablePage></TablePage>
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
