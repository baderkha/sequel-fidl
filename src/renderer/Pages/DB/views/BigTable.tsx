import React from 'react';
import DataTable from '../main-table/MainTable';

export type BigTableProps = {
    selectedTable: string;
    connectionId: string;
};

export function BigTableView(props: BigTableProps) {
    // load default data
    React.useEffect(() => {}, []);

    return (
        <DataTable
            rowCount={1}
            Data={[{ id: 1, first_name: 'ahmad', last_name: 'baderkhan' }]}
            Schema={{
                primaryKey: 'id',
                cols: [
                    { headerName: 'id', field: 'id' },
                    { headerName: 'First Name', field: 'first_name' },
                    { headerName: 'Last Name', field: 'last_name' },
                ],
            }}
        ></DataTable>
    );
}
