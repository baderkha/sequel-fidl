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
import RefreshIcon from '@mui/icons-material/Refresh';

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
};
export default function SideNav(s: SideNavProps) {
    let { tables } = s;
    if (!tables) {
        tables = new Array();
    }

    tables = tables.sort((a, b) => a.Name.localeCompare(b.Name));
    const [tbls, setTables] = React.useState([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [viewIndex, setViewIndex] = React.useState(s.viewIndexOverride);
    const onChangeIndex = (event: React.SyntheticEvent, newValue: number) => {
        setViewIndex(newValue);
        s.onViewIndexChange && s.onViewIndexChange(newValue);
    };
    React.useEffect(() => {
        console.log('use effects');
        setTables(tables);
        filterTableVal(searchTerm);
    }, [viewIndex, tables]);
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
                        selectedDB={'main_db'}
                        dbs={['main_db', 'second_db']}
                    ></DBSelect>

                    <div style={{ width: '100%', textAlign: 'center' }}>
                        <Typography variant="caption">
                            (MYSQL v5.7) php-dev
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
                            <Tab
                                icon={<InfoIcon color="primary" />}
                                label="Table info"
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
                        >
                            <ListItemButton>
                                <ListItemIcon>
                                    {Type == 'table' ? (
                                        <FormatAlignJustifyIcon htmlColor="#B99100" />
                                    ) : (
                                        <TableViewIcon htmlColor="purple" />
                                    )}
                                </ListItemIcon>
                                <ListItemText primary={Name} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </CustomDrawer>
        </div>
    );
}
