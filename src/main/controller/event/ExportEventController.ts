import { IpcMain, shell } from 'electron';
import { ExportService } from '../../service/export/ExportService';
import type { BatchExportRequest, ExportRequest, ExportSourceSpec } from '../../service/export/types';

type Arg<T> = { Data: T };

export const ExportEventController = (e: IpcMain, ser: ExportService) => {
    e.handle('export_formats', () => ser.Formats());
    e.handle('export_columns', (_, a: Arg<{ conID: string; source: ExportSourceSpec }>) => ser.Columns(a.Data.conID, a.Data.source));
    e.handle('export_preview', (_, a: Arg<ExportRequest>) => ser.Preview(a.Data));
    e.handle('export_start', (ev, a: Arg<ExportRequest>) => ser.Start(ev.sender, a.Data));
    e.handle('export_cancel', (_, a: Arg<{ jobId: string }>) => ser.Cancel(a.Data.jobId));
    e.handle('export_choose_dir', (ev, a: Arg<{ defaultDir: string | null }>) => ser.ChooseDir(ev.sender, a.Data.defaultDir));
    e.handle('export_batch_start', (ev, a: Arg<BatchExportRequest>) => ser.StartBatch(ev.sender, a.Data));
    e.handle('export_reveal', (_, a: Arg<{ path: string }>) => shell.showItemInFolder(a.Data.path));
};
