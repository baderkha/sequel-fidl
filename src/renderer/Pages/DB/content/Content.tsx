import {
    Button,
    Table,
    TextareaAutosize,
    TextField,
    Divider,
    Snackbar,
    Alert,
} from '@mui/material';
import React, { useEffect } from 'react';
import { MainTable } from '../main-table/MainTable';

import { useAtom } from 'jotai';
import { DummyConID } from 'renderer/State';
import {
    RunManualQueryEvent,
    SelectFromTableEvent,
} from 'main/controller/event/SQLEventController';
import { ErrorTuple } from 'main/util/tuple';
import { GridColDef } from '@mui/x-data-grid';
import { CodeEditorIFRAME } from 'renderer/Components/CodeEditor/CodeEditor';

export type ContentTabProps = {
    TableName: string;
};

export const Content = (p: ContentTabProps) => {
    const [conID] = useAtom(DummyConID);

    const [tableRows, setTableRows] = React.useState([]);
    console.log('render');
    useEffect(() => {
        window.electron.ipcRenderer
            .invokeAs<any[]>(
                'select_from_table',
                new SelectFromTableEvent().WithData({
                    conID,
                    s: {
                        tableName: p.TableName,
                        extraFilters: null,
                        limit: 20,
                        offset: 0,
                        orderByCol: '',
                    },
                })
            )
            .then((data) => {
                console.log(data, 1);

                setTableRows(data);
            });
    }, [conID, p.TableName]);

    const generateSchemaFromTableRows = (rows: any[]): DataTableSchema => {
        if (!(rows && rows.length > 0)) {
            return null;
        }
        const defs = Object.keys(rows[0]).map((key): GridColDef => {
            return {
                field: key,
                headerName: key,
            };
        });

        return {
            cols: defs,
            primaryKey: '',
        };
    };
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <MainTable
                disableCheckBox={true}
                sx={{
                    marginTop: '-5.5px',
                    paddingTop: '0px',
                    height: '100%',
                    borderRadius: '0',
                    borderBottom: 'none',
                }}
                Data={tableRows}
                Schema={generateSchemaFromTableRows(tableRows)}
            />
        </div>
    );
};
