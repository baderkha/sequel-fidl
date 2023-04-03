import { GridColDef } from '@mui/x-data-grid';

export const generateSchemaFromTableRows = (rows: any[]): DataTableSchema => {
    if (!(rows && rows.length > 0)) {
        return null;
    }
    const defs = Object.keys(rows[0]).map((key): GridColDef => {
        return {
            field: key,
            headerName: key,
            flex: 1,
        };
    });

    return {
        cols: defs,
        primaryKey: '',
    };
};
