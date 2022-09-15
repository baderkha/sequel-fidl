import * as React from 'react';
import { DataGrid, GridColDef, GridValueGetterParams } from '@mui/x-data-grid';

const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', editable: true },
    { field: 'firstName', headerName: 'First name', editable: true },
    { field: 'lastName', headerName: 'Last name', editable: true },
    {
        field: 'age',
        headerName: 'Age',
        type: 'number',
    },
];

const rows = [
    { id: 1, lastName: 'Snow', firstName: 'Jon', age: 35 },
    { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 42 },
    { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 45 },
    { id: 4, lastName: 'Stark', firstName: 'Arya', age: 16 },
    { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: null },
    { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
    { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
    { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
    { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
];

export default function DataTable() {
    return (
        <DataGrid
            editMode="row"
            rows={rows}
            columns={columns}
            pageSize={17}
            isCellEditable={() => true}
            experimentalFeatures={{ newEditingApi: true }}
            rowsPerPageOptions={[5]}
            checkboxSelection
        />
    );
}
