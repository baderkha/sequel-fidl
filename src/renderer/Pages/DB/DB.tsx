import { Box, setRef, Tab, Tabs, Toolbar } from '@mui/material';
import { useAtom } from 'jotai';
import {
    CloneTableEvent,
    DropTableEvent,
    GetDialectInfoEvent,
    ListDatabasesEvent,
    RenameTableEvent,
    ShowAllTablesEvent,
    ShowCreateTableEvent,
    SwitchDataBaseEvent,
    TruncateTableEvent,
} from '../../../main/controller/event/SQLEventController';
import React, { useState } from 'react';
import { DummyConID } from 'renderer/State';
import DataTable from './main-table/MainTable';
import SideNav, { TableNav } from './side-nav/SideNav';
import { Table } from '../../../main/util/sql_admin_commands';
import { QueryFile } from './query-file/QueryFile';
import { Content } from './content/Content';
import { Structure } from './structure/Structure';
import { DialectInfoRes } from 'main/service/SQLService';
import TableCloneDialog from 'renderer/Components/TableActions/TableCloneDialog';
import TableRenameDialog from 'renderer/Components/TableActions/TableRenameDialog';
import TableTruncateOrDropDialog from 'renderer/Components/TableActions/TableTruncateOrDrop';

export function DBView() {
    const [conID, setConID] = useAtom(DummyConID);
    const [tables, setTables] = useState<TableNav[]>(new Array<TableNav>());
    const [tabViewIdx, setTabViewIdx] = useState(0);
    const [selectedTable, setSelectedTable] = useState('');
    const [dbs, setDbs] = useState([]);
    const [selectedDB, setSelectedDB] = useState('');
    const [dialectInfo, setDialectInfo] = useState({});
    const [hoveredTable, setHoveredTable] = useState('');
    const [isTableCloneShown, setIsTableCloneShown] = useState(false);
    const [isTableRenameShown, setisTableRenameShown] = useState(false);
    const [isTableTruncateShowm, setisTableTruncateShown] = useState(false);
    const [isTableDropShown, setIsTableDropShown] = useState(false);
    const [refreshStamp, setRefreshStamp] = useState(Date.now());
    const onTableSelected = (name: string) => {
        console.log('changing table to', name);
        setSelectedTable(name);
        setTabViewIdx(0);
    };
    const onTableDDLCopy = (tName: string) => {
        console.log('log', tName);
        window.electron.ipcRenderer.invokeAs<String>(
            'show_create_sql',
            new ShowCreateTableEvent()
                .WithData({
                    conID: conID,
                    tableName: tName,
                })
                .Build()
        );
    };
    const onTableClone = (tableName: string) => {
        setIsTableCloneShown(true);
        setHoveredTable(tableName);
    };
    const onTableRename = (tableName: string) => {
        setisTableRenameShown(true);
        setHoveredTable(tableName);
    };
    const onTableTruncate = (tableName: string) => {
        setisTableTruncateShown(true);
        setHoveredTable(tableName);
    };
    const onTableDrop = (tableName: string) => {
        setIsTableDropShown(true);
        setHoveredTable(tableName);
    };
    const onDBChange = (newDB : string) => {
        window.electron.ipcRenderer.
            invokeAs<Error>(
                "switch_database",
                new SwitchDataBaseEvent().WithData({
                    conID : conID,
                    dbName: newDB,
                }).Build()
            ).then((err)=>{
                if (err){
                    console.log(err) // implement fatal error screen and crash
                } else {
                    RefreshAll()
                }
            })
    }
    const genTables = () => {
        window.electron.ipcRenderer
            .invokeAs<Array<string>>(
                'list_databases',
                new ListDatabasesEvent().WithData({ conID: conID }).Build()
            )
            .then((_dbs) => setDbs(_dbs));
        window.electron.ipcRenderer
            .invokeAs<Table[]>(
                'show_all_tables',
                new ShowAllTablesEvent().WithData({ conID: conID }).Build()
            )
            .then((tables) => {
                console.log(tables);
                if (tables && tables.length > 0) {
                    setSelectedTable(tables[0].Name);
                }
                setTables(tables);
            });
        window.electron.ipcRenderer
            .invokeAs<DialectInfoRes>(
                'get_dialect_info',
                new GetDialectInfoEvent().WithData({ conID: conID }).Build()
            )
            .then((res) => {
                setSelectedDB(res.DatabaseName)
                setDialectInfo(res)
            });
    };
    const onTabViewIndexChange = (idx: number) => {
        console.log(idx);
        setTabViewIdx(idx);
    };

    const RefreshAll = () => {
        genTables();
        setRefreshStamp(Date.now());
    };

    React.useEffect(() => {
        console.log(window);
        genTables();
    }, [conID]);
    return (
        <div>
            <TableCloneDialog
                tableName={hoveredTable}
                isShown={isTableCloneShown}
                onExit={() => {
                    setIsTableCloneShown(false);
                }}
                onConfirm={(tName, dName, mustCopy) => {
                    console.log(tName, dName, mustCopy);
                    window.electron.ipcRenderer
                        .invokeAs<Error>(
                            'clone_table',
                            new CloneTableEvent()
                                .WithData({
                                    conID: conID,
                                    mustDuplicateData: mustCopy,
                                    newTable: dName,
                                    oldTable: tName,
                                })
                                .Build()
                        )
                        .then((_err) => {
                            if (_err != null) {
                            } else {
                                setIsTableCloneShown(false);
                                RefreshAll();
                            }
                        });
                }}
            ></TableCloneDialog>
            <TableRenameDialog
                tableName={hoveredTable}
                isShown={isTableRenameShown}
                onExit={() => {
                    setisTableRenameShown(false);
                }}
                onConfirm={(tName, newTable) => {
                    console.log(tName);
                    window.electron.ipcRenderer
                        .invokeAs<Error>(
                            'rename_table',
                            new RenameTableEvent()
                                .WithData({
                                    conID: conID,
                                    newTable: newTable,
                                    oldTable: tName,
                                })
                                .Build()
                        )
                        .then((_err) => {
                            if (_err != null) {
                            } else {
                                setisTableRenameShown(false);
                                RefreshAll();
                            }
                        });
                }}
            ></TableRenameDialog>
            <TableTruncateOrDropDialog
                tableName={hoveredTable}
                isShown={isTableTruncateShowm}
                mode={'Truncate'}
                onExit={() => {
                    setisTableTruncateShown(false);
                }}
                onConfirm={(tName) => {
                    window.electron.ipcRenderer
                        .invokeAs<Error>(
                            'truncate_table',
                            new TruncateTableEvent()
                                .WithData({
                                    conID: conID,
                                    tableName: tName,
                                })
                                .Build()
                        )
                        .then((_err) => {
                            if (_err != null) {
                            } else {
                                setisTableTruncateShown(false);
                                RefreshAll();
                            }
                        });
                }}
            ></TableTruncateOrDropDialog>
            <TableTruncateOrDropDialog
                tableName={hoveredTable}
                isShown={isTableDropShown}
                mode={'Drop'}
                onExit={() => {
                    setIsTableDropShown(false);
                }}
                onConfirm={(tName) => {
                    window.electron.ipcRenderer
                        .invokeAs<Error>(
                            'drop_table',
                            new DropTableEvent()
                                .WithData({
                                    conID: conID,
                                    tableName: tName,
                                })
                                .Build()
                        )
                        .then((_err) => {
                            if (_err != null) {
                            } else {
                                setIsTableDropShown(false);
                                RefreshAll();
                            }
                        });
                }}
            ></TableTruncateOrDropDialog>
            <SideNav
                tables={tables}
                onTableSelected={onTableSelected}
                onViewIndexChange={onTabViewIndexChange}
                viewIndexOverride={tabViewIdx}
                onRefreshClicked={RefreshAll}
                dataBases={dbs}
                currentDatabase={selectedDB}
                onTableGetDDL={onTableDDLCopy}
                onTableClone={onTableClone}
                onTableRename={onTableRename}
                onTableTruncate={onTableTruncate}
                onTableDelete={onTableDrop}
                onDBChange={onDBChange}
                dialectInfo={dialectInfo}
                conLabel='php-dev'
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
                                <Content
                                    TableName={selectedTable}
                                    refreshStamp={refreshStamp}
                                ></Content>
                            );
                        case 1:
                            return (
                                <Structure
                                    TableName={selectedTable}
                                ></Structure>
                            );
                        case 2:
                            return (
                                <QueryFile
                                    onQueryCalled={RefreshAll}
                                ></QueryFile>
                            );
                    }
                })()}
            </div>
        </div>
    );
}
