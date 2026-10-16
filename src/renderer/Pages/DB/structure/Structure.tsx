import React from 'react';
import { useAtom } from 'jotai';
import { CircleAlert, Copy, Link2, ListTree, Pencil, Plus, Rows3 } from 'lucide-react';
import { ConID } from 'renderer/State';
import { api } from 'renderer/api';
import { DataGrid, GridColumn } from 'renderer/Components/DataGrid/DataGrid';
import { SqlEditor } from 'renderer/Components/SqlEditor/SqlEditor';
import { Splitter, usePersistentSize } from 'renderer/Components/ui/Splitter';
import { useToast } from 'renderer/Components/ui/Toasts';
import { ident, str, Tab } from 'renderer/Components/CreateTable/model';

export type StructureProps = {
    TableName: string;
    refreshStamp: number;
    isView: boolean;
    /** open the structure editor (on a tab , optionally with a new blank row) */
    onEdit: (tab: Tab, add?: 'column' | 'index' | 'foreignKey') => void;
};

type Section = 'columns' | 'indexes' | 'foreignKeys';

const COLUMN_COLS: GridColumn[] = ['Field', 'Type', 'Collation', 'Null', 'Key', 'Default', 'Extra', 'Comment'].map(
    (key) => ({ key, numeric: false })
);
const INDEX_COLS: GridColumn[] = ['Name', 'Type', 'Columns', 'Cardinality', 'Visible'].map((key) => ({
    key,
    numeric: key === 'Cardinality',
}));
const FK_COLS: GridColumn[] = ['Name', 'Columns', 'References', 'On Delete', 'On Update'].map((key) => ({
    key,
    numeric: false,
}));

/** SHOW INDEX rows => one row per index */
const groupIndexes = (rows: any[]) => {
    const map = new Map<string, any[]>();
    rows.forEach((r) => map.set(r.Key_name, [...(map.get(r.Key_name) || []), r]));
    return Array.from(map.entries()).map(([name, parts]) => {
        parts.sort((a, b) => a.Seq_in_index - b.Seq_in_index);
        const first = parts[0];
        return {
            Name: name,
            Type:
                name === 'PRIMARY'
                    ? 'PRIMARY'
                    : first.Index_type === 'FULLTEXT' || first.Index_type === 'SPATIAL'
                    ? first.Index_type
                    : Number(first.Non_unique) === 0
                    ? 'UNIQUE'
                    : 'INDEX',
            Columns: parts
                .map((x) => `${x.Column_name ?? x.Expression}${x.Sub_part ? `(${x.Sub_part})` : ''}`)
                .join(', '),
            Cardinality: parts[parts.length - 1].Cardinality,
            Visible: first.Visible ?? 'YES',
        };
    });
};

export const Structure = (p: StructureProps) => {
    const [conID] = useAtom(ConID);
    const notify = useToast();
    const [section, setSection] = React.useState<Section>('columns');
    const [columns, setColumns] = React.useState<any[]>([]);
    const [indexes, setIndexes] = React.useState<any[]>([]);
    const [fks, setFks] = React.useState<any[]>([]);
    const [ddl, setDDL] = React.useState('');
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [ddlHeight, setDDLHeight] = usePersistentSize('sequel-fidl.ddl-h', 260);

    React.useEffect(() => {
        if (!conID || !p.TableName) {
            return undefined;
        }
        let live = true;
        setLoading(true);
        setError('');
        const t = p.TableName;
        Promise.all([
            api.rows(conID, `SHOW FULL COLUMNS FROM ${ident(t)}`),
            p.isView ? Promise.resolve([]) : api.rows(conID, `SHOW INDEX FROM ${ident(t)}`),
            p.isView
                ? Promise.resolve([])
                : api.rows(
                      conID,
                      `SELECT k.CONSTRAINT_NAME n, GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) c,
                              k.REFERENCED_TABLE_NAME rt,
                              GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION) rc,
                              r.DELETE_RULE d, r.UPDATE_RULE u
                       FROM information_schema.KEY_COLUMN_USAGE k
                       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                        AND r.TABLE_NAME = k.TABLE_NAME
                       WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = ${str(t)}
                         AND k.REFERENCED_TABLE_NAME IS NOT NULL
                       GROUP BY k.CONSTRAINT_NAME, k.REFERENCED_TABLE_NAME, r.DELETE_RULE, r.UPDATE_RULE`
                  ),
            api.createSQL(conID, t),
        ])
            .then(([cols, idx, fk, sql]) => {
                if (!live) {
                    return;
                }
                setColumns(cols.map(({ Privileges, ...rest }) => rest));
                setIndexes(groupIndexes(idx));
                setFks(
                    fk.map((r) => ({
                        Name: r.n,
                        Columns: `${r.c}`.split(',').join(', '),
                        References: `${r.rt} (${`${r.rc}`.split(',').join(', ')})`,
                        'On Delete': r.d,
                        'On Update': r.u,
                    }))
                );
                setDDL(sql ? `${sql};` : '');
            })
            .catch((err) => live && setError(err.message || `${err}`))
            .finally(() => live && setLoading(false));
        return () => {
            live = false;
        };
    }, [conID, p.TableName, p.refreshStamp]);

    const sections: { id: Section; label: string; icon: React.ReactNode; count: number }[] = [
        { id: 'columns', label: 'Columns', icon: <Rows3 size={13} />, count: columns.length },
        { id: 'indexes', label: 'Indexes', icon: <ListTree size={13} />, count: indexes.length },
        { id: 'foreignKeys', label: 'Foreign Keys', icon: <Link2 size={13} />, count: fks.length },
    ];

    return (
        <div className="view">
            <div className="app-toolbar">
                <div className="segmented is-compact">
                    {sections.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={section === s.id ? 'is-active' : ''}
                            disabled={p.isView && s.id !== 'columns'}
                            onClick={() => setSection(s.id)}
                        >
                            {s.icon} {s.label}
                            <span className="tab-count">{s.count}</span>
                        </button>
                    ))}
                </div>
                <div className="toolbar-spacer" />
                {!p.isView && (
                    <>
                        <button type="button" className="btn is-ghost" onClick={() => p.onEdit('columns', 'column')}>
                            <Plus size={13} /> Column
                        </button>
                        <button type="button" className="btn is-ghost" onClick={() => p.onEdit('indexes', 'index')}>
                            <Plus size={13} /> Index
                        </button>
                        <button type="button" className="btn is-ghost" onClick={() => p.onEdit('foreignKeys', 'foreignKey')}>
                            <Plus size={13} /> Foreign Key
                        </button>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => p.onEdit(section === 'foreignKeys' ? 'foreignKeys' : section)}
                        >
                            <Pencil size={13} /> Edit Structure…
                        </button>
                    </>
                )}
            </div>
            {error ? (
                <div className="result-message is-error">
                    <div className="error-box">
                        <CircleAlert size={15} />
                        {error}
                    </div>
                </div>
            ) : section === 'columns' ? (
                <DataGrid columns={COLUMN_COLS} rows={columns} loading={loading} storageKey="structure:columns" empty="No columns" />
            ) : section === 'indexes' ? (
                <DataGrid columns={INDEX_COLS} rows={indexes} loading={loading} storageKey="structure:indexes" empty="No indexes" />
            ) : (
                <DataGrid columns={FK_COLS} rows={fks} loading={loading} storageKey="structure:fks" empty="No foreign keys" />
            )}
            <Splitter direction="horizontal" size={ddlHeight} min={80} max={900} reverse onChange={setDDLHeight} />
            <div className="results" style={{ height: ddlHeight }}>
                <div className="ddl-header">
                    Create Statement
                    <div className="toolbar-spacer" />
                    <button
                        type="button"
                        className="btn is-ghost"
                        disabled={!ddl}
                        onClick={() =>
                            navigator.clipboard
                                .writeText(ddl)
                                .then(() => notify('Copied CREATE statement', 'success'))
                        }
                    >
                        <Copy size={13} /> Copy
                    </button>
                </div>
                <SqlEditor value={ddl} readOnly />
            </div>
        </div>
    );
};
