import { Op } from 'sequelize';
import { GetPersistentDBConnection } from '../config';
import { Worksheet } from '../model/Worksheet';
import { WorksheetFolder } from '../model/WorksheetFolder';
import { BaseSQLRepository } from '../util/store/repository/sql';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';

export type WorksheetInfo = {
    id: number;
    scope: string;
    name: string;
    sql: string;
    folderId: number | null;
    updatedAt: string;
};

export type FolderInfo = {
    id: number;
    name: string;
    parentId: number | null;
};

export type ExplorerTree = { folders: FolderInfo[]; worksheets: WorksheetInfo[] };

const toInfo = (row: any): WorksheetInfo => ({
    id: row.id,
    scope: row.scope,
    name: row.name,
    sql: row.sql || '',
    folderId: row.folderId ?? null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
});

const toFolder = (row: any): FolderInfo => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId ?? null,
});

const clean = (name: string, fallback: string) => name.trim().replace(/[\\/]/g, '-') || fallback;

/**
 * Saved SQL worksheets and the folders they live in , per connection
 */
export class WorksheetService {
    private static _instance: WorksheetService;
    private sheets: BaseSQLRepository<Worksheet>;
    private folders: BaseSQLRepository<WorksheetFolder>;

    constructor(sheets: BaseSQLRepository<Worksheet>, folders: BaseSQLRepository<WorksheetFolder>) {
        this.sheets = sheets;
        this.folders = folders;
    }

    static Default(): WorksheetService {
        if (!WorksheetService._instance) {
            const db = GetPersistentDBConnection();
            WorksheetService._instance = new WorksheetService(
                new BaseSQLRepository<Worksheet>(new Worksheet(), db),
                new BaseSQLRepository<WorksheetFolder>(new WorksheetFolder(), db)
            );
        }
        return WorksheetService._instance;
    }

    async Tree(scope: string): Promise<ExplorerTree> {
        const [folders, sheets] = await Promise.all([
            this.folders.getDb().findAll({ where: { scope }, order: [['name', 'ASC']] }),
            this.sheets.getDb().findAll({ where: { scope }, order: [['name', 'ASC']] }),
        ]);
        return {
            folders: folders.map((r) => toFolder(r.get({ plain: true }))),
            worksheets: sheets.map((r) => toInfo(r.get({ plain: true }))),
        };
    }

    /** names are unique per folder , like files */
    private async nameTaken(
        kind: 'sheet' | 'folder',
        scope: string,
        parent: number | null,
        name: string,
        exceptId?: number
    ) {
        const where: any = { scope, name };
        where[kind === 'sheet' ? 'folderId' : 'parentId'] = parent ?? { [Op.is]: null };
        if (exceptId) {
            where.id = { [Op.ne]: exceptId };
        }
        const repo: BaseSQLRepository<any> = kind === 'sheet' ? this.sheets : this.folders;
        return (await repo.getDb().count({ where })) > 0;
    }

    async Create(
        scope: string,
        name: string,
        sql = '',
        folderId: number | null = null
    ): Promise<ErrorTuple<WorksheetInfo>> {
        const n = clean(name, 'Untitled');
        if (await this.nameTaken('sheet', scope, folderId, n)) {
            return NewErrorTuple(null, new Error(`"${n}" already exists in this folder`));
        }
        try {
            const row = await this.sheets.getDb().create({ scope, name: n, sql, folderId });
            return NewErrorTuple(toInfo(row.get({ plain: true })), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    async Update(
        id: number,
        patch: { name?: string; sql?: string; folderId?: number | null }
    ): Promise<Error | null> {
        const row: any = await this.sheets.getDb().findByPk(id);
        if (!row) {
            return new Error('Worksheet not found');
        }
        const data: any = {};
        if (patch.sql !== undefined) data.sql = patch.sql;
        if (patch.name !== undefined) data.name = clean(patch.name, 'Untitled');
        if (patch.folderId !== undefined) data.folderId = patch.folderId;
        if (data.name !== undefined || data.folderId !== undefined) {
            const name = data.name ?? row.name;
            const folder = data.folderId !== undefined ? data.folderId : row.folderId;
            if (await this.nameTaken('sheet', row.scope, folder, name, id)) {
                return new Error(`"${name}" already exists in that folder`);
            }
        }
        return this.sheets
            .getDb()
            .update(data, { where: { id } })
            .then(() => null)
            .catch((err) => err as Error);
    }

    Delete(id: number): Promise<Error | null> {
        return this.sheets.DeleteByIndex({ id });
    }

    async CreateFolder(scope: string, name: string, parentId: number | null): Promise<ErrorTuple<FolderInfo>> {
        const n = clean(name, 'New Folder');
        if (await this.nameTaken('folder', scope, parentId, n)) {
            return NewErrorTuple(null, new Error(`A folder named "${n}" already exists there`));
        }
        try {
            const row = await this.folders.getDb().create({ scope, name: n, parentId });
            return NewErrorTuple(toFolder(row.get({ plain: true })), null);
        } catch (err) {
            return NewErrorTuple(null, err as Error);
        }
    }

    /** every folder id inside (and including) a folder */
    private async subtree(scope: string, id: number): Promise<number[]> {
        const all = (await this.folders.getDb().findAll({ where: { scope } })).map(
            (r) => r.get({ plain: true }) as any
        );
        const out = [id];
        for (let i = 0; i < out.length; i++) {
            all.filter((f) => f.parentId === out[i]).forEach((f) => out.push(f.id));
        }
        return out;
    }

    async UpdateFolder(id: number, patch: { name?: string; parentId?: number | null }): Promise<Error | null> {
        const row: any = await this.folders.getDb().findByPk(id);
        if (!row) {
            return new Error('Folder not found');
        }
        const data: any = {};
        if (patch.name !== undefined) data.name = clean(patch.name, 'New Folder');
        if (patch.parentId !== undefined) {
            if (patch.parentId !== null && (await this.subtree(row.scope, id)).includes(patch.parentId)) {
                return new Error("A folder can't be moved into itself");
            }
            data.parentId = patch.parentId;
        }
        const name = data.name ?? row.name;
        const parent = data.parentId !== undefined ? data.parentId : row.parentId;
        if (await this.nameTaken('folder', row.scope, parent, name, id)) {
            return new Error(`A folder named "${name}" already exists there`);
        }
        return this.folders
            .getDb()
            .update(data, { where: { id } })
            .then(() => null)
            .catch((err) => err as Error);
    }

    /** deletes the folder , its sub folders and every worksheet in them */
    async DeleteFolder(id: number): Promise<Error | null> {
        const row: any = await this.folders.getDb().findByPk(id);
        if (!row) {
            return null;
        }
        const ids = await this.subtree(row.scope, id);
        try {
            await this.sheets.getDb().destroy({ where: { folderId: ids } });
            await this.folders.getDb().destroy({ where: { id: ids } });
            return null;
        } catch (err) {
            return err as Error;
        }
    }
}
