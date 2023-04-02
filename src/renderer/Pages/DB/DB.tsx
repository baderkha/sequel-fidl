import { Box, Tab, Tabs, Toolbar } from '@mui/material';
import { useAtom } from 'jotai';
import { ShowAllTablesEvent } from '../../../main/controller/event/SQLEventController';
import React, { useState } from 'react';
import { DummyConID } from 'renderer/State';
import DataTable from './main-table/MainTable';
import SideNav, { TableNav } from './side-nav/SideNav';
import { Table } from '../../../main/util/sql_admin_commands';
import { QueryFile } from './query-file/QueryFile';
import { Content } from './content/Content';

export function DBView() {
    const [conID, setConID] = useAtom(DummyConID);
    const [tables, setTables] = useState<TableNav[]>(new Array<TableNav>());
    const [tabViewIdx, setTabViewIdx] = useState(0);
    const [selectedTable, setSelectedTable] = useState('');
    const onTableSelected = (name: string) => {
        console.log('changing table to', name);
        setSelectedTable(name);
        setTabViewIdx(0);
    };
    const genTables = () => {
        window.electron.ipcRenderer
            .invokeAs<Table[]>(
                'show_all_tables',
                new ShowAllTablesEvent().WithData({ conID: conID }).Build()
            )

            .then((tables) => {
                console.log(tables);
                if (tables.length > 0) {
                    setSelectedTable(tables[0].Name);
                }
                setTables(tables);
            });
    };
    const onTabViewIndexChange = (idx: number) => {
        console.log(idx);
        setTabViewIdx(idx);
    };
    const onRefreshTablesClicked = () => {
        genTables();
    };
    React.useEffect(() => {
        console.log(window);
        genTables();
    }, [conID]);
    return (
        <div>
            <SideNav
                tables={tables}
                onTableSelected={onTableSelected}
                onViewIndexChange={onTabViewIndexChange}
                viewIndexOverride={tabViewIdx}
                onRefreshClicked={onRefreshTablesClicked}
            ></SideNav>
            <div
                style={{
                    marginTop: '100px',
                    marginLeft: '240px',
                    display: 'flex',
                    justifyContent: 'center',
                    height: `calc(100vh - ${
                        tabViewIdx == 2 ? '145px' : '100px'
                    })`,

                    width: 'calc(100vw - 240px)',
                }}
            >
                {(() => {
                    switch (tabViewIdx) {
                        case 0:
                            return (
                                <Content TableName={selectedTable}></Content>
                            );
                        case 2:
                            return <QueryFile></QueryFile>;
                    }
                })()}
            </div>
        </div>
    );
}
