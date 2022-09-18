import {
    Button,
    Table,
    TextareaAutosize,
    TextField,
    Divider,
    Snackbar,
    Alert,
    Tooltip,
} from '@mui/material';
import React, { useEffect } from 'react';
import Editor from 'react-simple-code-editor';
import { MainTable } from '../main-table/MainTable';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism.css'; //Example style, you can use another
import { format } from '@supabase/sql-formatter';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoFixNormalIcon from '@mui/icons-material/AutoFixNormal';
import { useAtom } from 'jotai';
import { DummyConID } from 'renderer/State';
import { RunManualQueryEvent } from 'main/controller/event/SQLEventController';
import { ErrorTuple } from 'main/util/tuple';

export const QueryFile = () => {
    const [conID] = useAtom(DummyConID);
    const [code, setCode] = React.useState('');
    const [selection, setSelection] = React.useState('');
    const [errMsg, setErrMsg] = React.useState('');
    const [tableRows, setTableRows] = React.useState([]);

    useEffect(() => {
        window.onselect = (ev) => {
            if (ev.srcElement.id == 'editor-text-area') {
                setSelection(window.getSelection().toString());
            }
        };
    }, [conID]);

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Editor
                autoCorrect="1"
                placeholder={'query ...'}
                textareaId={'editor-text-area'}
                autoFocus={true}
                value={code}
                onValueChange={(code) => setCode(code)}
                highlight={(code) => highlight(code, languages.sql)}
                padding={10}
                style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    height: 'calc(50% - 41px)',
                    width: '100%',
                    overflowY: 'scroll',
                }}
                onFocus={(el) => {
                    el.target.style.outline = 'none';
                }}
            />
            <Divider></Divider>
            <div
                style={{
                    width: '100%',
                    height: '40px',
                    marginBottom: '5.5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Button
                    variant="outlined"
                    onClick={() => {
                        setCode(format(code));
                    }}
                    size="small"
                    endIcon={<AutoFixNormalIcon />}
                    sx={{
                        marginLeft: '5px',
                        textTransform: 'none',
                        borderRadius: '0',
                    }}
                >
                    Beautify
                </Button>
                <Tooltip title={selection}>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            const sel = selection;

                            window.electron.ipcRenderer
                                .invokeAs<ErrorTuple<any[]>>(
                                    'run_manual_query',
                                    new RunManualQueryEvent().WithData({
                                        conID,
                                        query: sel,
                                    })
                                )
                                .then((res) => {
                                    setSelection('');
                                    const [data, err] = res;
                                    if (err != null) {
                                        setErrMsg(err.message);
                                    } else {
                                        setTableRows(data);
                                    }
                                });
                        }}
                        endIcon={<PlayArrowIcon />}
                        size="small"
                        sx={{
                            marginRight: '5px',
                            textTransform: 'none',
                            borderRadius: '0',
                        }}
                        disabled={!selection}
                    >
                        Run Selection
                    </Button>
                </Tooltip>
            </div>
            <MainTable
                sx={{
                    marginTop: '-5.5px',
                    paddingTop: '0px',
                    height: '50%',
                    borderRadius: '0',
                }}
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
