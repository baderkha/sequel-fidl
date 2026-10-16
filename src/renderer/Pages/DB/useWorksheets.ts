import React from 'react';
import { api, FsEntry, onMainEvent, SessionInfo, WorksheetInfo } from 'renderer/api';

const LEGACY_QUERY_KEY = 'sequel-fidl.query';
const SAVE_DELAY_MS = 500;

/** files that open in the editor , anything else opens in its default app */
export const TEXT_FILE = /\.(sql|txt|md|json|csv|tsv|log|ya?ml|xml|js|ts|sh|env|ini|conf|cfg|toml|psql|ddl)$/i;

/** quick queries and the project folder belong to the saved connection / playground (or the label of an unsaved one) */
export const worksheetScope = (s: SessionInfo | null) =>
    s ? `${s.kind}:${s.refId ?? s.label}` : '';

/**
 * a document : the connection's quick query , one virtual file kept in the app database (id `quick:<id>`) ,
 * or a file of the project folder (id `file:<rel>`)
 */
export type Doc = {
    id: string;
    name: string;
    sql: string;
    /** the scratch pad stored per connection in the app database */
    quick: boolean;
    quickId?: number;
    /** path relative to the project folder (files) */
    rel?: string;
};

type Tabs = { open: string[]; active: string | null };

const fileId = (rel: string) => `file:${rel}`;
const quickId = (id: number) => `quick:${id}`;
const relOf = (id: string) => (id.startsWith('file:') ? id.slice(5) : null);
const quickOf = (id: string) => (id.startsWith('quick:') ? Number(id.slice(6)) : null);
export const dirOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1);
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

const read = <T>(key: string, fallback: T): T => {
    try {
        const v = localStorage.getItem(key);
        return v ? (JSON.parse(v) as T) : fallback;
    } catch (e) {
        return fallback;
    }
};
const write = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
};
const forget = (key: string) => {
    try {
        localStorage.removeItem(key);
    } catch (e) {}
};

export type Worksheets = ReturnType<typeof useWorksheets>;

/**
 * What the editors work on : the quick query (one per connection scratch pad in the app database) and ,
 * when a project folder is connected , its files on disk with the open file tabs
 */
export function useWorksheets(scope: string) {
    /** undefined while loading , null when no folder is connected */
    const [folder, setFolder] = React.useState<string | null | undefined>(undefined);
    const [entries, setEntries] = React.useState<FsEntry[]>([]);
    const [contents, setContents] = React.useState<Record<string, string>>({});
    const [quick, setQuick] = React.useState<WorksheetInfo | null>(null);
    const [tabs, setTabs] = React.useState<Tabs>({ open: [], active: null });
    const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
    const [loaded, setLoaded] = React.useState(false);
    const timers = React.useRef(new Map<string, number>());
    const pending = React.useRef(new Map<string, string>());
    const contentsRef = React.useRef(contents);
    contentsRef.current = contents;

    const keys = { tabs: `sequel-fidl.files.${scope}`, drafts: `sequel-fidl.drafts.${scope}` };

    const reload = React.useCallback(async () => {
        const list = await api.workspaceTree(scope).catch((): FsEntry[] => []);
        setEntries(list);
        return list;
    }, [scope]);

    const loadFile = async (rel: string) => {
        const [text, err] = await api.readFile(scope, rel);
        if (!err) setContents((c) => ({ ...c, [rel]: text }));
        return err;
    };

    // start : quick query , folder , tree , tabs
    React.useEffect(() => {
        if (!scope) return;
        (async () => {
            const [f, tree] = await Promise.all([api.workspaceFolder(scope), api.worksheetTree(scope).catch(() => null)]);
            setFolder(f);
            const rows = tree ? [...tree.worksheets].sort((a, b) => a.id - b.id) : [];

            // one quick query per connection : older drafts / several quick queries are folded into it , nothing is lost
            const extra: Array<{ name: string; sql: string }> = rows.slice(1).map((w) => ({ name: w.name, sql: w.sql }));
            read<Array<{ name: string; sql: string }>>(keys.drafts, []).forEach((d) => extra.push({ name: d.name, sql: d.sql || '' }));
            try {
                const legacyOne = localStorage.getItem(LEGACY_QUERY_KEY) || '';
                if (legacyOne.trim()) extra.push({ name: 'Untitled', sql: legacyOne });
            } catch (e) {}
            let main = rows[0] || null;
            const folded = extra.filter((x) => x.sql.trim()).map((x) => `-- ${x.name}\n${x.sql.trim()}\n`);
            if (!main) {
                const [made] = await api.createWorksheet(scope, 'Quick Query', folded.join('\n'));
                main = made;
            } else if (folded.length) {
                const sql = [main.sql.trim() ? `${main.sql.trim()}\n` : '', ...folded].filter(Boolean).join('\n');
                if (!(await api.updateWorksheet(main.id, { sql }))) main = { ...main, sql };
            }
            if (main && main.name !== 'Quick Query' && !(await api.updateWorksheet(main.id, { name: 'Quick Query' }))) {
                main = { ...main, name: 'Quick Query' };
            }
            if (main) {
                for (const w of rows.slice(1)) {
                    // eslint-disable-next-line no-await-in-loop
                    await api.deleteWorksheet(w.id);
                }
                forget(keys.drafts);
                forget(LEGACY_QUERY_KEY);
            }
            setQuick(main);

            let files: FsEntry[] = [];
            if (f) {
                files = await reload();
                api.watchWorkspace(scope);
            }
            // the tabs are the project's files
            const saved = read<Tabs>(keys.tabs, { open: [], active: null });
            const open = saved.open.filter((id) => files.some((e) => !e.dir && fileId(e.rel) === id));
            await Promise.all(open.map(relOf).filter(Boolean).map(loadFile));
            setTabs({ open, active: open.includes(saved.active) ? saved.active : open[0] ?? null });
            setLoaded(true);
        })();
    }, [scope]);

    React.useEffect(() => {
        if (loaded) write(keys.tabs, tabs);
    }, [tabs, loaded]);

    // changes made outside the app (Finder , the terminal ...)
    React.useEffect(() => {
        if (!folder) return undefined;
        return onMainEvent<{ root: string }>('workspace_changed', async ({ root }) => {
            if (root !== folder) return;
            const list = await reload();
            // refresh open files that aren't being edited
            Object.keys(contentsRef.current).forEach((rel) => {
                if (!pending.current.has(fileId(rel)) && list.some((e) => e.rel === rel)) loadFile(rel);
            });
        });
    }, [folder]);

    // ---- saving (autosave , ⌘S flushes) : files to disk , quick queries to the app database
    const settle = (id: string) =>
        setPendingIds((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
        });
    const flush = (id: string) => {
        window.clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        if (!pending.current.has(id)) return;
        const sql = pending.current.get(id);
        pending.current.delete(id);
        const rel = relOf(id);
        const q = quickOf(id);
        if (rel) api.writeFile(scope, rel, sql).then(() => settle(id));
        else if (q !== null) api.updateWorksheet(q, { sql }).then(() => settle(id));
    };
    React.useEffect(() => {
        const flushAll = () => Array.from(pending.current.keys()).forEach(flush);
        window.addEventListener('beforeunload', flushAll);
        return () => {
            window.removeEventListener('beforeunload', flushAll);
            flushAll();
        };
    }, []);

    const files = entries.filter((e) => !e.dir);
    const docOf = (id: string | null): Doc | null => {
        if (!id) return null;
        const rel = relOf(id);
        if (!rel || contents[rel] === undefined) return null;
        return { id, rel, name: baseName(rel), sql: contents[rel], quick: false };
    };

    /** open a project file (text files in the editor , others in their default app) */
    const openFile = async (rel: string) => {
        if (!TEXT_FILE.test(rel)) {
            await api.openExternally(scope, rel);
            return null;
        }
        if (contentsRef.current[rel] === undefined) {
            const err = await loadFile(rel);
            if (err) return err;
        }
        const id = fileId(rel);
        setTabs((t) => ({ open: t.open.includes(id) ? t.open : [...t.open, id], active: id }));
        return null;
    };
    const open = (id: string) =>
        setTabs((t) => ({ open: t.open.includes(id) ? t.open : [...t.open, id], active: id }));
    /** closing a tab keeps the file , reopen it from the explorer or ⌘P */
    const close = (id: string) => {
        flush(id);
        setTabs((t) => {
            const idx = t.open.indexOf(id);
            const next = t.open.filter((x) => x !== id);
            return { open: next, active: t.active === id ? next[Math.min(idx, next.length - 1)] ?? null : t.active };
        });
    };

    const setSql = (id: string, sql: string) => {
        const q = quickOf(id);
        if (q !== null) setQuick((w) => (w && w.id === q ? { ...w, sql } : w));
        else setContents((c) => ({ ...c, [relOf(id)]: sql }));
        pending.current.set(id, sql);
        setPendingIds((s) => new Set(s).add(id));
        window.clearTimeout(timers.current.get(id));
        timers.current.set(id, window.setTimeout(() => flush(id), SAVE_DELAY_MS));
    };

    const withSql = (name: string) => (/\.[a-z0-9]+$/i.test(name) ? name : `${name}.sql`);

    /** a new empty file at the top of the project (untitled.sql , untitled 2.sql …) , opened */
    const newFile = async () => {
        const taken = new Set(entries.filter((e) => e.parent === '').map((e) => e.name.toLowerCase()));
        let name = 'untitled.sql';
        for (let i = 2; taken.has(name); i += 1) name = `untitled ${i}.sql`;
        return createFile('', name, '');
    };

    /**
     * a new file in the project (from the explorer , the quick query saved to the project , save a copy)
     * replace : that tab becomes the new file
     */
    const createFile = async (
        dir: string,
        name: string,
        content = '',
        opts: { replace?: string; closeAfter?: boolean } = {}
    ) => {
        const [rel, err] = await api.createFileOnDisk(scope, dir, withSql(name), content);
        if (err) return err;
        setContents((c) => ({ ...c, [rel]: content }));
        await reload();
        const id = fileId(rel);
        if (opts.replace) {
            if (opts.closeAfter) {
                close(opts.replace);
            } else {
                setTabs((t) => ({
                    open: t.open.map((x) => (x === opts.replace ? id : x)),
                    active: t.active === opts.replace ? id : t.active,
                }));
            }
        } else if (!opts.closeAfter) {
            open(id);
        }
        return null;
    };

    const createFolder = async (dir: string, name: string) => {
        const [rel, err] = await api.createFolderOnDisk(scope, dir, name);
        if (!err) await reload();
        return { rel, err };
    };

    /** rename / move a file or folder , open tabs follow it */
    const move = async (fromRel: string, toRel: string) => {
        Array.from(pending.current.keys()).forEach(flush);
        const [newRel, err] = await api.movePath(scope, fromRel, toRel);
        if (err) return err;
        const remap = (rel: string) =>
            rel === fromRel ? newRel : rel.startsWith(`${fromRel}/`) ? newRel + rel.slice(fromRel.length) : rel;
        setContents((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [remap(k), v])));
        setTabs((t) => {
            const map = (id: string) => (relOf(id) ? fileId(remap(relOf(id))) : id);
            return { open: t.open.map(map), active: t.active ? map(t.active) : null };
        });
        await reload();
        return null;
    };
    const rename = (rel: string, name: string) => move(rel, join(dirOf(rel), name.trim()));

    const renameDoc = (doc: Doc, name: string) => rename(doc.rel, name);

    const trash = async (rel: string) => {
        const err = await api.trashPath(scope, rel);
        if (err) return err;
        const gone = (id: string) => {
            const r = relOf(id);
            return !!r && (r === rel || r.startsWith(`${rel}/`));
        };
        setTabs((t) => {
            const next = t.open.filter((id) => !gone(id));
            return { open: next, active: t.active && gone(t.active) ? next[0] ?? null : t.active };
        });
        await reload();
        return null;
    };

    const copyIn = async (sources: string[], dir: string) => {
        const [copied, err] = await api.copyIntoWorkspace(scope, sources, dir);
        await reload();
        return { copied, err };
    };

    /** a folder is connected , or the user picks one now (false : cancelled) */
    const ensureFolder = async (label: string) => {
        if (folder) return true;
        const [f] = await api.chooseWorkspaceFolder(scope, label);
        if (!f) return false;
        await adopt(f);
        return true;
    };
    const chooseFolder = async (label: string) => {
        const [f, err] = await api.chooseWorkspaceFolder(scope, label);
        if (f) await adopt(f);
        return err;
    };
    const createDefaultFolder = async (label: string) => {
        const [f, err] = await api.defaultWorkspaceFolder(scope, label);
        if (f) await adopt(f);
        return err;
    };
    /** switched to a (new) folder : files of the old one can't stay open */
    const adopt = async (f: string) => {
        Array.from(pending.current.keys()).forEach(flush);
        setFolder(f);
        setContents({});
        setTabs({ open: [], active: null });
        await reload();
        api.watchWorkspace(scope);
    };

    return {
        loaded,
        folder,
        entries,
        files,
        /** the connection's quick query */
        quick: quick ? ({ id: quickId(quick.id), name: quick.name, sql: quick.sql, quick: true, quickId: quick.id } as Doc) : null,
        openDocs: tabs.open.map(docOf).filter(Boolean) as Doc[],
        active: docOf(tabs.active),
        activeId: tabs.active,
        isDirty: (d: Doc) => pendingIds.has(d.id),
        absPath: (rel: string) => (folder ? `${folder}/${rel}` : rel),
        openFile,
        open,
        close,
        setSql,
        flush,
        newFile,
        createFile,
        createFolder,
        move,
        rename,
        renameDoc,
        trash,
        copyIn,
        reveal: (rel: string) => api.revealPath(scope, rel),
        chooseFolder,
        ensureFolder,
        createDefaultFolder,
        reload,
    };
}
