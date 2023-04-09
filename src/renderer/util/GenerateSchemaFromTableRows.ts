import { GridColDef } from '@mui/x-data-grid';

export const generateSchemaFromTableRows = (
    rows: any[],
    { sortable = false, subMenuEnabled = false, canEdit = false } = {}
): DataTableSchema => {
    if (!(rows && rows.length > 0)) {
        return null;
    }
    const defs = Object.keys(rows[0]).map((key): GridColDef => {
        return {
            field: key,
            headerName: key,
            flex: 1,
            headerAlign: 'center',
            align: 'center',
            hideSortIcons: !sortable,
            disableColumnMenu: !subMenuEnabled,
            minWidth: 150,
            editable: canEdit,
        };
    });

    return {
        cols: defs,
        primaryKey: '',
    };
};
