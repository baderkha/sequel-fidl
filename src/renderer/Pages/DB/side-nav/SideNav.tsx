import * as React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import CssBaseline from '@mui/material/CssBaseline';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TableViewIcon from '@mui/icons-material/TableView';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import TextField from '@mui/material/TextField';
import { search } from 'fast-fuzzy';
import CustomDrawer from 'renderer/Components/CustomDrawer/CustomDrawer';
import { DBSelect } from '../select-db/SelectDB';
import { Tabs, Tab, IconButton } from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SchemaIcon from '@mui/icons-material/Schema';
import InfoIcon from '@mui/icons-material/Info';
import AddIcon from '@mui/icons-material/Add';
import { useDetectClickOutside } from 'react-detect-click-outside';
import 'react-contexify/ReactContexify.css';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileCopyIcon from '@mui/icons-material/FileCopy';

import { Menu, Item, Separator, useContextMenu } from 'react-contexify';
import { DialectInfoRes } from 'main/service/SQLService';
import { propNames } from '@chakra-ui/react';

const MENU_ID = 'blahblah';

const drawerWidth = 250;
export type TableNav = {
    Name: string;
    Type: 'table' | 'view';
};
export type SideNavProps = {
    tables: TableNav[];
    onTableSelected: (tableName: string) => void;
    onViewIndexChange: (index: number) => void;
    onRefreshClicked: () => void;
    viewIndexOverride: number;
    children: React.ReactNode;
    dbName?: string;
    dataBases: Array<string>;
    currentDatabase: string;
    onTableTruncate: (tableName: string) => void;
    onTableDelete: (tableName: string) => void;
    onTableGetDDL: (tableName: string) => void;
    onTableRename: (tableName: string) => void;
    onTableClone: (tableName: string) => void;
    onDBChange : (newSchemaName : string) => void;
    dialectInfo : DialectInfoRes;
    conLabel : string;
};
export default function SideNav(s: SideNavProps) {
    let { tables } = s;
    if (!tables) {
        tables = new Array();
    }

    tables = tables.sort((a, b) => a.Name.localeCompare(b.Name));

    const menuRef = useDetectClickOutside({
        onTriggered: () => {
            console.log('clicked outside');
            hideAll();
        },
    });
    const [tbls, setTables] = React.useState([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [tHover, setTableHovered] = React.useState(tbls[0]);
    const [viewIndex, setViewIndex] = React.useState(s.viewIndexOverride);
    const onChangeIndex = (event: React.SyntheticEvent, newValue: number) => {
        setViewIndex(newValue);
        s.onViewIndexChange && s.onViewIndexChange(newValue);
    };
    const OnItemHover = (Name: string) => () => {
        setTableHovered(Name);
    };
    const { show, hideAll } = useContextMenu({
        id: MENU_ID,
    });
    const handleContextMenu = (event: any) => {
        show({
            event,
            props: {
                tableName: tHover,
            },
        });
    };
   
    const handleItemClick = ({ id, event, props }) => {
        switch (id) {
            case 'SHOW_CREATE_STMT':
                s.onTableGetDDL(props.tableName);
                break;
            case 'cut':
                console.log(event, props);
                break;
            case 'CLONE_TABLE':
                s.onTableClone(props.tableName);
                break;
            case 'RENAME':
                s.onTableRename(props.tableName);
                break;
            case 'TRUNCATE':
                s.onTableTruncate(props.tableName);
                break;
            case 'DROP':
                s.onTableDelete(props.tableName);
                break;
        }
    };
    React.useEffect(() => {
        console.log('use effects');
        setTables(tables);
        filterTableVal(searchTerm);
    }, [viewIndex, tables, tHover]);
    const filterTableVal = (val: string) => {
        setSearchTerm(val);
        if (val == '') {
            setTables(tables);
            return;
        }
        const res = search(val, tables, { keySelector: (obj) => obj.Name });

        setTables(res);
    };
    console.log('state var ', tbls);
    return (
        <div style={{ display: 'flex' }}>
            <CssBaseline />
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 2,
                    backgroundColor: '#dedede',
                }}
                color="default"
            >
                <Toolbar>
                    <DBSelect
                        selectedDB={s.currentDatabase}
                        dbs={s.dataBases}
                        OnDBSeletionChange={s.onDBChange}
                    ></DBSelect>

                    <div style={{ width: '100%', textAlign: 'center' }}>
                        <Typography variant="caption">
                            {`(${s.dialectInfo.Dialect.toUpperCase()} v${s.dialectInfo.Version}) ${s.conLabel}`}
                        </Typography>
                        <Tabs
                            value={viewIndex}
                            onChange={onChangeIndex}
                            centered
                        >
                            <Tab
                                icon={<TableViewIcon htmlColor="#B99100" />}
                                label="Content"
                                sx={{ textTransform: 'none' }}
                            />
                            <Tab
                                icon={<SchemaIcon htmlColor="#B99100" />}
                                label="Structure"
                                sx={{ textTransform: 'none' }}
                            />
                            <Tab
                                icon={
                                    <InsertDriveFileIcon htmlColor="#bf360c" />
                                }
                                label="Query"
                                sx={{ textTransform: 'none' }}
                            />
                        </Tabs>
                    </div>
                </Toolbar>
            </AppBar>

            <CustomDrawer>
                <Toolbar />
                <Divider />

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        height: '70px',
                        alignItems: 'center',
                        userSelect: 'none',
                    }}
                >
                    <div style={{ width: '92%' }}>
                        <TextField
                            fullWidth
                            variant="outlined"
                            label=""
                            placeholder="search for table ..."
                            id="fullWidth"
                            onChange={(ev) => {
                                filterTableVal(ev.target.value);
                            }}
                            size="small"
                        />
                    </div>
                </div>
                <Divider />

                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                    }}
                >
                    <Typography
                        variant="subtitle1"
                        style={{ marginLeft: '4px' }}
                        sx={{
                            color: '#808081',
                            fontWeight: 'bold',
                            marginTop: '5px',
                            userSelect: 'none',
                        }}
                    >
                        Tables
                    </Typography>
                    <div>
                        <IconButton>
                            <AddIcon />
                        </IconButton>
                        <IconButton>
                            <RefreshIcon onClick={s.onRefreshClicked} />
                        </IconButton>
                    </div>
                </div>
                <List>
                    {tbls.map(({ Name, Type }, index) => (
                        <ListItem
                            key={Name}
                            disablePadding
                            onClick={() => {
                                if (Type == 'table') {
                                    s.onTableSelected(Name);
                                }
                            }}
                            onMouseEnter={OnItemHover(Name)}
                            onMouseExit={OnItemHover(Name)}
                        >
                            <ListItemButton onContextMenu={handleContextMenu}>
                                <ListItemIcon>
                                    {Type == 'table' ? (
                                        <FormatAlignJustifyIcon htmlColor="#B99100" />
                                    ) : (
                                        <TableViewIcon htmlColor="purple" />
                                    )}
                                </ListItemIcon>
                                <ListItemText primary={Name} />
                            </ListItemButton>
                            <Menu id={MENU_ID}>
                                <Item
                                    id="SHOW_CREATE_STMT"
                                    onClick={handleItemClick}
                                >
                                    <ContentCopyIcon
                                        fontSize={'12px'}
                                        style={{ marginRight: '5px' }}
                                    ></ContentCopyIcon>
                                    Copy Create Statement
                                </Item>
                                <Item
                                    id="CLONE_TABLE"
                                    onClick={handleItemClick}
                                >
                                    <FileCopyIcon
                                        fontSize={'12px'}
                                        style={{ marginRight: '5px' }}
                                    ></FileCopyIcon>
                                    Clone
                                </Item>
                                <Item id="RENAME" onClick={handleItemClick}>
                                    <DriveFileRenameOutlineIcon
                                        fontSize={'12px'}
                                        style={{ marginRight: '5px' }}
                                    ></DriveFileRenameOutlineIcon>
                                    Rename
                                </Item>
                                <Item
                                    id="TRUNCATE"
                                    onClick={handleItemClick}
                                    onMouseEnter={(e) => {
                                        e.target.style.backgroundColor =
                                            '#e13570';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.backgroundColor =
                                            'white';
                                    }}
                                >
                                    <ClearAllIcon
                                        fontSize={'12px'}
                                        style={{ marginRight: '5px' }}
                                    ></ClearAllIcon>
                                    Truncate
                                </Item>
                                <Item
                                    id="DROP"
                                    onClick={handleItemClick}
                                    onMouseEnter={(e) => {
                                        e.target.style.backgroundColor =
                                            '#e13570';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.backgroundColor =
                                            'white';
                                    }}
                                >
                                    <DeleteForeverIcon
                                        fontSize={'12px'}
                                        style={{ marginRight: '5px' }}
                                    ></DeleteForeverIcon>
                                    Drop Table
                                </Item>
                            </Menu>
                        </ListItem>
                    ))}
                </List>
            </CustomDrawer>
        </div>
    );
}
