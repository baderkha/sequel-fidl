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
import { RunManualQueryEvent } from 'main/controller/event/SQLEventController';
import { ErrorTuple } from 'main/util/tuple';
import { GridColDef } from '@mui/x-data-grid';
import { CodeEditorIFRAME } from 'renderer/Components/CodeEditor/CodeEditor';

export const QueryFile = () => {
    const [conID] = useAtom(DummyConID);
    let editorRef = React.useRef();
    const [code, setCode] = React.useState(' ');
    const [html, setHTML] = React.useState('');
    const [selection, setSelection] = React.useState('');
    const [errMsg, setErrMsg] = React.useState('');

    const [tableRows, setTableRows] = React.useState([]);
    console.log('render');
    useEffect(() => {
        window.onselect = (ev) => {
            if (ev.srcElement.id == 'editor-text-area') {
                setSelection(window.getSelection().toString());
            }
        };
    }, [conID]);

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
            <div style={{ width: '100%', height: '55.5%' }}>
                <CodeEditorIFRAME
                    onRun={function (selection: string): void {
                        window.electron.ipcRenderer
                            .invokeAs<ErrorTuple<any[]>>(
                                'run_manual_query',
                                new RunManualQueryEvent().WithData({
                                    query: selection,
                                    conID,
                                })
                            )
                            .then((data) => {
                                const [res, err] = data;
                                if (err != null) {
                                    setErrMsg(err.message);
                                    setTableRows([]);
                                    return;
                                }
                                setTableRows(res);
                            });
                    }}
                    tables={[]}
                    columns={[]}
                />
            </div>

            <MainTable
                disableCheckBox={true}
                sx={{
                    marginTop: '-5.5px',
                    paddingTop: '0px',
                    height: '50%',
                    borderRadius: '0',
                }}
                Data={tableRows}
                Schema={generateSchemaFromTableRows(tableRows)}
            />
            <Snackbar
                open={!!errMsg}
                autoHideDuration={6000}
                onClose={() => setErrMsg('')}
            >
                <Alert severity="error">{errMsg}</Alert>
            </Snackbar>
        </div>
    );
};
