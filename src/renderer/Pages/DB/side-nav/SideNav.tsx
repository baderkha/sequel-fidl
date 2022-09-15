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

const drawerWidth = 250;
export type TableNav = {
    Name: string;
    Type: 'table' | 'view';
};
export type SideNavProps = {
    tables: TableNav[];
    children: React.ReactNode;
};
export default function SideNav(s: SideNavProps) {
    let { tables } = s;
    if (!tables) {
        tables = new Array();
    }
    tables = tables.sort((a, b) => a.Name.localeCompare(b.Name));
    const [tbls, setTables] = React.useState(s.tables);
    const filterTableVal = (val: string) => {
        if (val == '') {
            setTables(tables);
            return;
        }
        const res = search(val, tables, { keySelector: (obj) => obj.Name });
        setTables(res);
    };
    return (
        <Box sx={{ display: 'flex' }}>
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
                <List>
                    {tbls.map(({ Name, Type }, index) => (
                        <ListItem key={Name} disablePadding>
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
            <div
                style={{
                    marginLeft: '240px',
                    display: 'flex',
                    justifyContent: 'center',
                    height: 'calc(100vh - 65px)',

                    width: 'calc(100vw - 200px)',
                }}
            >
                <Box
                    component="main"
                    sx={{
                        flexGrow: 1,
                        bgcolor: 'background.default',
                        height: '100%',
                        width: '100%',
                    }}
                >
                    <Toolbar />

                    {s.children}
                </Box>
            </div>
        </Box>
    );
}
