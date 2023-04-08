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

export type TableCloneDialogProps = {
    tableName: string;
    onConfirm: (
        tableName: string,
        duplicateName: string,
        mustCopyData: boolean
    ) => void;
    onExit: () => {};
    isShown: boolean;
};

export default function TableCloneDialog(t: TableCloneDialogProps) {
    const [formData, setFormData] = React.useState({});
    return (
        <div>
            <Dialog
                open={t.isShown}
                TransitionComponent={Transition}
                onClose={t.onExit}
                aria-describedby="alert-dialog-slide-description"
            >
                <DialogTitle>{`Clone \`${t.tableName}\` ?`}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="name"
                        label="New Table Name"
                        type="string"
                        fullWidth
                        variant="standard"
                        value={formData.duplicateName}
                        onChange={(ev) =>
                            setFormData({
                                ...formData,
                                duplicateName: ev.target.value,
                            })
                        }
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                defaultChecked={false}
                                checked={formData.mustDuplicate}
                                onChange={(ev) => {
                                    const checked = !formData.mustDuplicate;
                                    setFormData({
                                        ...formData,
                                        mustDuplicate: checked,
                                    });
                                }}
                            />
                        }
                        label="Duplicate table content"
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        color="error"
                        onClick={() => {
                            setFormData({});
                            t.onExit && t.onExit();
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            t.onConfirm &&
                                t.onConfirm(
                                    t.tableName,
                                    formData.duplicateName,
                                    formData.mustDuplicate
                                );
                            setFormData({});
                        }}
                    >
                        Duplicate
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}
