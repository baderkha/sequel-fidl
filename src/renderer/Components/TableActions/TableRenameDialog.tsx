import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import { FormControlLabel, Switch, TextField } from '@mui/material';

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & {
        children: React.ReactElement<any, any>;
    },
    ref: React.Ref<unknown>
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export type TableRenameDialogProps = {
    tableName: string;
    onConfirm: (tableName: string, newTableName: string) => void;
    onExit: () => {};
    isShown: boolean;
};

export default function TableRenameDialog(t: TableRenameDialogProps) {
    const [formData, setFormData] = React.useState({});
    return (
        <div>
            <Dialog
                open={t.isShown}
                TransitionComponent={Transition}
                onClose={t.onExit}
                aria-describedby="alert-dialog-slide-description"
            >
                <DialogTitle>{`Rename \`${t.tableName}\` to`}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="name"
                        label="New Table Name"
                        type="string"
                        fullWidth
                        variant="standard"
                        value={formData.newTableName}
                        onChange={(ev) =>
                            setFormData({
                                ...formData,
                                newTableName: ev.target.value,
                            })
                        }
                    />
                </DialogContent>
                <DialogActions>
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
                        Rename
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}
