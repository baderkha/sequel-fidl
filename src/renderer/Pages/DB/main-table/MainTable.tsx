import * as React from 'react';
import {
    DataGrid,
    GridColDef,
    GridSlotsComponent,
    GridValueGetterParams,
} from '@mui/x-data-grid';
import { v4 } from 'uuid';
import { SxProps } from '@mui/material';
import { Theme } from '@chakra-ui/react';

export type DataTableSchema = {
    cols: GridColDef[];
    primaryKey: string;
};

export type DataTableProps = {
    Data?: any[];
    Schema?: DataTableSchema;
    OnRowEdit?: (row: any) => void;
    OnRowDelete?: (row: any) => void;
    onPageChange?: (pageNumber: number) => void;
    rowCount?: number;
    maxRowPerPage?: number;
    sx?: SxProps<Theme>;
    components?: Partial<GridSlotsComponent>;
    disableCheckBox?: boolean;
};

export function MainTable(props: DataTableProps) {
    return (
        <DataGrid
            components={props.components}
            sx={{ ...props.sx, overflow: 'auto' }}
            editMode="row"
            onPageChange={(pageNumber: number) =>
                props.onPageChange && props.onPageChange(pageNumber)
            }
            rows={props.Data ? props.Data : []}
            rowCount={props.rowCount ? props.rowCount : 0}
            columns={props.Schema && props.Schema.cols ? props.Schema.cols : []}
            pageSize={props.maxRowPerPage ? props.maxRowPerPage : 17}
            isCellEditable={() => true}
            experimentalFeatures={{ newEditingApi: true }}
            rowsPerPageOptions={[25, 50, 100]}
            checkboxSelection={!props.disableCheckBox}
            getRowId={(row: any) => {
                if (props.Schema && props.Schema.primaryKey) {
                    return row[props.Schema.primaryKey];
                }
                return v4();
            }}
        />
    );
}
