import React, { useCallback } from 'react';
import { makeStyles } from '@mui/material/styles';
import Drawer from '@mui/material/Drawer';

export const defaultDrawerWidth = 240;
const minDrawerWidth = 220;
const maxDrawerWidth = 1000;

export type CustomDrawerProps = {
    children: React.ReactNode;
};

export default function CustomDrawer(props: CustomDrawerProps) {
    const { children } = props;
    const [drawerWidth, setDrawerWidth] = React.useState(defaultDrawerWidth);

    const handleMouseDown = () => {
        document.addEventListener('mouseup', handleMouseUp, true);
        document.addEventListener('mousemove', handleMouseMove, true);
    };

    const handleMouseUp = () => {
        document.removeEventListener('mouseup', handleMouseUp, true);
        document.removeEventListener('mousemove', handleMouseMove, true);
    };

    const handleMouseMove = useCallback((e: any) => {
        const newWidth = e.clientX - document.body.offsetLeft;
        if (newWidth > minDrawerWidth && newWidth < maxDrawerWidth) {
            setDrawerWidth(newWidth);
        }
    }, []);

    return (
        <Drawer
            style={{
                flexShrink: 0,
            }}
            variant="permanent"
            PaperProps={{
                style: { width: drawerWidth },
                sx: {
                    backgroundColor: '#f0f0f0',
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                    },
                },
            }}
        >
            <div
                onMouseDown={() => handleMouseDown()}
                style={{
                    width: '0.5px',
                    cursor: 'ew-resize',
                    padding: '4px 0 0',
                    borderTop: '5px solid #ddd',
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 100,
                    backgroundColor: '#d4d4d4',
                }}
            />
            {children}
        </Drawer>
    );
}
