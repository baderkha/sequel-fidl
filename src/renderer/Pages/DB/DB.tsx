import { Box, Tab, Tabs } from '@mui/material';
import { useAtom } from 'jotai';
import { ShowAllTablesEvent } from '../../../main/controller/event/SQLEventController';
import React, { useState } from 'react';
import { DummyConID } from 'renderer/State';
import DataTable from './main-table/MainTable';
import SideNav, { TableNav } from './side-nav/SideNav';
import { Table } from '../../../main/util/sql_admin_commands';
import { QueryFile } from './query-file/QueryFile';

export function DBView() {
    const [conID, setConID] = useAtom(DummyConID);
    const [tables, setTables] = useState<TableNav[]>(new Array<TableNav>());
    React.useEffect(() => {
        window.electron.ipcRenderer
            .invokeAs<Table[]>(
                'show_all_tables',
                new ShowAllTablesEvent().WithData({ conID: conID }).Build()
            )
            .then((tables) => {
                console.log(tables);
                setTables(tables);
            });
    }, [conID]);
    return (
        <div>
            <SideNav tables={tables}>
                <QueryFile></QueryFile>
            </SideNav>
        </div>
    );
}
