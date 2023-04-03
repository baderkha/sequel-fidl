import {
    Button,
    Table,
    TextareaAutosize,
    TextField,
    Divider,
    Snackbar,
    Alert,
    Box,
    Typography,
} from '@mui/material';
import React, { useEffect } from 'react';
import { MainTable } from '../main-table/MainTable';

import { useAtom } from 'jotai';
import { DummyConID } from 'renderer/State';
import {
    RunManualQueryEvent,
    SelectFromTableEvent,
    ShowSchemaEvent,
} from 'main/controller/event/SQLEventController';
import { ErrorTuple } from 'main/util/tuple';
import { GridColDef } from '@mui/x-data-grid';
import { CodeEditorIFRAME } from 'renderer/Components/CodeEditor/CodeEditor';
import { generateSchemaFromTableRows } from 'renderer/util/GenerateSchemaFromTableRows';

export type StructureProps = {
    TableName: string;
};

const Title = () => {
    return <div></div>;
};

export const Structure = (p: StructureProps) => {
    const [conID] = useAtom(DummyConID);

    const [tableRows, setTableRows] = React.useState([]);
    console.log('render');
    useEffect(() => {
        window.electron.ipcRenderer
            .invokeAs<any[]>(
                'show_schema',
                new ShowSchemaEvent().WithData({
                    conID,
                    tableName: p.TableName,
                })
            )
            .then((data) => {
                console.log(data, 1);
                setTableRows(
                    data.map((da) => {
                        delete da['JsFriendlyType'];
                        return da;
                    })
                );
            });
    }, [conID, p.TableName]);

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <MainTable
                components={{ Toolbar: Title }}
                disableCheckBox={true}
                sx={{
                    marginTop: '-10.5px',
                    paddingTop: '0px',
                    height: '100%',
                    borderRadius: '0',
                    borderBottom: 'none',
                }}
                Data={tableRows}
                rowCount={tableRows.length}
                Schema={generateSchemaFromTableRows(tableRows)}
            />
        </div>
    );
};
