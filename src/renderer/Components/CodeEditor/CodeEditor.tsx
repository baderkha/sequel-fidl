import CodeEditor from '@uiw/react-textarea-code-editor';
import Frame from 'react-frame-component';
import React from 'react';
import {
    Button,
    Tooltip,
    Snackbar,
    ButtonGroup,
    Tooltip,
    Alert,
    Divider,
} from '@mui/material';
import { RunManualQueryEvent } from 'main/controller/event/SQLEventController';
import { ErrorTuple } from 'main/util/tuple';
import { format } from '@supabase/sql-formatter';
import useMessage from '@rottitime/react-hook-message-event';

import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AutoFixNormalIcon from '@mui/icons-material/AutoFixNormal';

export type CodeEditorProps = {
    onRun: (selection: string) => void;
    tables: string[];
    columns: { tableOwner: string; name: string }[];
};

export const CodeEditorIFRAME = (props: CodeEditorProps) => {
    const [code, setCode] = React.useState('');
    const [selection, setSelection] = React.useState('');

    const evHandler = React.useCallback(
        (ev: any) => {
            try {
                const data = JSON.parse(ev.data);
                switch (data.type) {
                    case 'setCode': {
                        const newCode = data.data;
                        setCode(newCode);
                        break;
                    }
                    case 'setSelection': {
                        const newSelection = data.data;
                        setSelection(newSelection);
                        break;
                    }
                }
            } catch (e) {}
        },
        [code, selection]
    );

    React.useEffect(() => {
        const ifr = document.getElementById(
            'code-editor-frame'
        ) as HTMLIFrameElement;
        window.addEventListener('message', evHandler);

        return () => {
            window.removeEventListener('message', evHandler);
        };
    }, [evHandler]);

    const formatCode = () => {
        const ifr = document.getElementById(
            'code-editor-frame'
        ) as HTMLIFrameElement;
        const ev = JSON.stringify({
            type: 'setCode',
            data: format(code, {
                uppercase: true,
            }),
        });
        ifr.contentWindow.postMessage(ev, '*');
    };

    React.useEffect(() => {
        console.log(selection);
    }, [selection]);
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <iframe
                id="code-editor-frame"
                src={`file://${window.electron.__dirname}/../../assets/code-editor/editor.html`}
                style={{
                    height: 'calc(100% - 65px)',
                    width: '100%',
                    border: 'none',
                }}
            ></iframe>
            <Divider></Divider>
            <div
                style={{
                    width: '100%',
                    height: '50px',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Button
                    id="beautify-btn"
                    variant="outlined"
                    onClick={formatCode}
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
                <ButtonGroup variant="outlined">
                    <Button
                        id="beautify-btn"
                        onClick={formatCode}
                        size="small"
                        sx={{
                            marginLeft: '5px',
                            textTransform: 'none',
                            borderRadius: '0',
                        }}
                    >
                        Export AS CSV
                    </Button>
                    <Button
                        id="beautify-btn"
                        onClick={formatCode}
                        size="small"
                        sx={{
                            textTransform: 'none',
                            borderRadius: '0',
                        }}
                    >
                        {' '}
                        JSON
                    </Button>
                </ButtonGroup>
                <Tooltip
                    title={`query selected : \n${selection}`}
                    hidden={!selection}
                >
                    <Button
                        variant="outlined"
                        onClick={() => {
                            formatCode();
                            props.onRun && props.onRun(selection);
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
        </div>
    );
};
