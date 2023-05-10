import * as React from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';

export type DBSelectProps = {
    dbs?: Array<string>;
    selectedDB: string;
    OnDBSeletionChange : (newDB : string) =>void;
};

export function DBSelect(props: DBSelectProps) {
    const onDBChange = (tableName : string)=>{
        props.OnDBSeletionChange && props.OnDBSeletionChange(tableName)
    }
    return (
        <div style={{ minWidth: 200 }}>
            <FormControl fullWidth>
                <InputLabel id="demo-multiple-name-label">DB</InputLabel>
                <Select
                    labelId="demo-simple-select-label"
                    id="demo-simple-select"
                    value={props.selectedDB}
                    label="select db"
                    size="small"
                    
                >
                    {props.dbs && props.dbs.length
                        ? props.dbs.map((name) => {
                              return <MenuItem value={name} onClick={()=>{onDBChange(name)}}>{name}</MenuItem>;
                          })
                        : undefined}
                </Select>
            </FormControl>
        </div>
    );
}
