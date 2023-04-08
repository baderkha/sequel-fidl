import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import { FormControlLabel, Switch, TextField, Typography } from '@mui/material';

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
        children: React.ReactElement<any, any>;
    },
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export type TableTruncateOrDropProps = {
    tableName: string;
    mode: 'Truncate' | 'Drop';
    onConfirm: (tableName: string) => void;
    onExit: () => {};
    isShown: boolean;
};

export default function TableTruncateOrDropDialog(t: TableTruncateOrDropProps) {
    const msg =
        t.mode == 'Drop'
            ? 'This will remove the table and delete all rows !'
            : 'This will delete all the table rows';
    const [formData, setFormData] = React.useState({});
    return (
        <div>
            <Dialog
                open={t.isShown}
                TransitionComponent={Transition}
                onClose={t.onExit}
                aria-describedby="alert-dialog-slide-description"
            >
                <DialogTitle style={{ padding: '8px' }}>{t.mode}</DialogTitle>
                <DialogContentText style={{ padding: '8px' }}>
                    <Typography>{`Are you sure you want to ${t.mode.toLowerCase()} table \`${
                        t.tableName
                    }\` ? \n ${msg}`}</Typography>
                </DialogContentText>
                <DialogActions
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                    <Button
                        onClick={() => {
                            setFormData({});
                            t.onExit && t.onExit();
                        }}
                        color="error"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            t.onConfirm &&
                                t.onConfirm(t.tableName, formData.newTableName);
                            setFormData({});
                        }}
                    >
                        {t.mode.toUpperCase()}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}
