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
import { generateSchemaFromTableRows } from 'renderer/util/GenerateSchemaFromTableRows';
import { Parser } from '@json2csv/plainjs';

const saveFile =
    (content: any, isJSON = false) =>
    async () => {
        if (typeof (content?.then === 'function')) {
            content = await content;
        }
        const element = document.createElement('a');
        const file = new Blob([content], {
            type: 'text/plain',
        });
        element.href = URL.createObjectURL(file);
        element.download = `file.${isJSON ? 'json' : 'csv'}`;
        element.click();
    };

export const QueryFile = () => {
    const [conID] = useAtom(DummyConID);
    let editorRef = React.useRef();
    const [code, setCode] = React.useState(' ');
    const [html, setHTML] = React.useState('');
    const [selection, setSelection] = React.useState('');
    const [errMsg, setErrMsg] = React.useState('');
    const [successMsg, setSuccessMsg] = React.useState('');

    const [tableRows, setTableRows] = React.useState([]);
    console.log('render');
    useEffect(() => {
        window.onselect = (ev) => {
            if (ev.srcElement.id == 'editor-text-area') {
                setSelection(window.getSelection().toString());
            }
        };
    }, [conID]);

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
                                setSuccessMsg('executed query !');
                                setTableRows(res);
                            });
                    }}
                    tables={[]}
                    columns={[]}
                    onSaveJSON={saveFile(
                        JSON.stringify(tableRows, null, 4),
                        true
                    )}
                    onSaveCSV={saveFile(
                        tableRows.length > 0
                            ? new Parser().parse(tableRows)
                            : ''
                    )}
                />
            </div>

            <MainTable
                disableCheckBox={true}
                sx={{
                    marginTop: '-5.5px',
                    paddingTop: '0px',
                    height: '50%',
                    borderRadius: '0',
                    borderBottom: 'none',
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
            <Snackbar
                open={!!successMsg}
                autoHideDuration={6000}
                onClose={() => setSuccessMsg('')}
            >
                <Alert severity="success">{successMsg}</Alert>
            </Snackbar>
        </div>
    );
};
