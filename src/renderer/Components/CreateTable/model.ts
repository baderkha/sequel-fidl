/**
 * Create table wizard model + MySQL DDL generation.
 * Everything here is pure so the preview is exactly what gets executed.
 */

export type ParamKind = 'none' | 'optional' | 'required' | 'values';

export type TypeInfo = {
    name: string;
    group: string;
    /** what the length / values input means */
    param: ParamKind;
    placeholder?: string;
    numeric?: boolean;
    integer?: boolean;
    /** TEXT / BLOB / JSON / GEOMETRY can't take a literal default */
    noDefault?: boolean;
    /** supports ON UPDATE CURRENT_TIMESTAMP */
    temporal?: boolean;
    textual?: boolean;
    spatial?: boolean;
};

export const TYPES: TypeInfo[] = [
    { name: 'TINYINT', group: 'Numeric', param: 'none', numeric: true, integer: true },
    { name: 'SMALLINT', group: 'Numeric', param: 'none', numeric: true, integer: true },
    { name: 'MEDIUMINT', group: 'Numeric', param: 'none', numeric: true, integer: true },
    { name: 'INT', group: 'Numeric', param: 'none', numeric: true, integer: true },
    { name: 'BIGINT', group: 'Numeric', param: 'none', numeric: true, integer: true },
    { name: 'DECIMAL', group: 'Numeric', param: 'optional', placeholder: '10,2', numeric: true },
    { name: 'FLOAT', group: 'Numeric', param: 'none', numeric: true },
    { name: 'DOUBLE', group: 'Numeric', param: 'none', numeric: true },
    { name: 'BIT', group: 'Numeric', param: 'optional', placeholder: '1' },
    { name: 'BOOLEAN', group: 'Numeric', param: 'none' },
    { name: 'VARCHAR', group: 'String', param: 'required', placeholder: '255', textual: true },
    { name: 'CHAR', group: 'String', param: 'optional', placeholder: '1', textual: true },
    { name: 'TINYTEXT', group: 'String', param: 'none', noDefault: true, textual: true },
    { name: 'TEXT', group: 'String', param: 'none', noDefault: true, textual: true },
    { name: 'MEDIUMTEXT', group: 'String', param: 'none', noDefault: true, textual: true },
    { name: 'LONGTEXT', group: 'String', param: 'none', noDefault: true, textual: true },
    { name: 'ENUM', group: 'String', param: 'values', placeholder: 'a, b, c', textual: true },
    { name: 'SET', group: 'String', param: 'values', placeholder: 'a, b, c', textual: true },
    { name: 'BINARY', group: 'Binary', param: 'optional', placeholder: '16' },
    { name: 'VARBINARY', group: 'Binary', param: 'required', placeholder: '255' },
    { name: 'TINYBLOB', group: 'Binary', param: 'none', noDefault: true },
    { name: 'BLOB', group: 'Binary', param: 'none', noDefault: true },
    { name: 'MEDIUMBLOB', group: 'Binary', param: 'none', noDefault: true },
    { name: 'LONGBLOB', group: 'Binary', param: 'none', noDefault: true },
    { name: 'DATE', group: 'Date & Time', param: 'none' },
    { name: 'DATETIME', group: 'Date & Time', param: 'optional', placeholder: 'fsp', temporal: true },
    { name: 'TIMESTAMP', group: 'Date & Time', param: 'optional', placeholder: 'fsp', temporal: true },
    { name: 'TIME', group: 'Date & Time', param: 'optional', placeholder: 'fsp' },
    { name: 'YEAR', group: 'Date & Time', param: 'none' },
    { name: 'JSON', group: 'Other', param: 'none', noDefault: true },
    { name: 'GEOMETRY', group: 'Spatial', param: 'none', noDefault: true, spatial: true },
    { name: 'POINT', group: 'Spatial', param: 'none', noDefault: true, spatial: true },
    { name: 'LINESTRING', group: 'Spatial', param: 'none', noDefault: true, spatial: true },
    { name: 'POLYGON', group: 'Spatial', param: 'none', noDefault: true, spatial: true },
];

/** types we don't model (e.g. MULTIPOLYGON) keep their raw arguments */
export const typeInfo = (name: string): TypeInfo =>
    TYPES.find((t) => t.name === name) || { name, group: 'Other', param: 'optional' };

export type DefaultMode = 'none' | 'null' | 'value' | 'expression';

export type ColumnDef = {
    id: number;
    /** name on the server , undefined for a new column */
    origName?: string;
    /** generated / unsupported column : shown but not editable */
    locked?: boolean;
    /** column collation (text columns) */
    collation?: string;
    name: string;
    type: string;
    /** length , precision or enum values depending on the type */
    param: string;
    unsigned: boolean;
    nullable: boolean;
    primaryKey: boolean;
    autoIncrement: boolean;
    defaultMode: DefaultMode;
    defaultValue: string;
    onUpdateNow: boolean;
    comment: string;
};

export type IndexKind = 'INDEX' | 'UNIQUE' | 'FULLTEXT' | 'SPATIAL';

export type IndexDef = {
    id: number;
    /** name on the server , undefined for a new index */
    origName?: string;
    /** functional index : can be dropped but not edited */
    locked?: boolean;
    kind: IndexKind;
    name: string;
    /** column ids , in index order */
    columns: number[];
    /** prefix length per column id (needed to index TEXT / BLOB) */
    lengths?: Record<number, number>;
};

export const FK_ACTIONS = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'] as const;
export type FkAction = typeof FK_ACTIONS[number];

export type ForeignKeyDef = {
    id: number;
    /** constraint name on the server , undefined for a new key */
    origName?: string;
    name: string;
    columns: number[];
    refTable: string;
    refColumns: string[];
    onDelete: FkAction;
    onUpdate: FkAction;
};

export type TableOptions = {
    engine: string;
    charset: string;
    collation: string;
    autoIncrementStart: string;
    comment: string;
};

export type TableDef = {
    /** name on the server , undefined when creating */
    origName?: string;
    name: string;
    columns: ColumnDef[];
    indexes: IndexDef[];
    foreignKeys: ForeignKeyDef[];
    options: TableOptions;
};

export type Tab = 'columns' | 'indexes' | 'foreignKeys' | 'options';

export type Problem = {
    /** field the problem belongs to , used to highlight inputs */
    field: string;
    tab: Tab;
    message: string;
};

let nextId = 1;
export const uid = () => nextId++;

export const newColumn = (patch: Partial<ColumnDef> = {}): ColumnDef => ({
    id: uid(),
    name: '',
    type: 'VARCHAR',
    param: '255',
    unsigned: false,
    nullable: true,
    primaryKey: false,
    autoIncrement: false,
    defaultMode: 'none',
    defaultValue: '',
    onUpdateNow: false,
    comment: '',
    ...patch,
});

export const idColumn = () =>
    newColumn({
        name: 'id',
        type: 'INT',
        param: '',
        unsigned: true,
        nullable: false,
        primaryKey: true,
        autoIncrement: true,
    });

export const timestampColumns = () => [
    newColumn({
        name: 'created_at',
        type: 'TIMESTAMP',
        param: '',
        nullable: false,
        defaultMode: 'expression',
        defaultValue: 'CURRENT_TIMESTAMP',
    }),
    newColumn({
        name: 'updated_at',
        type: 'TIMESTAMP',
        param: '',
        nullable: false,
        defaultMode: 'expression',
        defaultValue: 'CURRENT_TIMESTAMP',
        onUpdateNow: true,
    }),
];

export const newTable = (): TableDef => ({
    name: '',
    columns: [idColumn()],
    indexes: [],
    foreignKeys: [],
    options: {
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collation: '',
        autoIncrementStart: '',
        comment: '',
    },
});

export const ident = (name: string) => '`' + name.replace(/`/g, '``') + '`';
export const str = (v: string) =>
    `'${v.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

const splitValues = (v: string) =>
    v
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');

const columnName = (def: TableDef, id: number) =>
    def.columns.find((c) => c.id === id)?.name || '?';

/** suggested name for an index / fk when the user left it empty */
export const autoIndexName = (def: TableDef, idx: IndexDef) =>
    `${idx.kind === 'UNIQUE' ? 'uq' : idx.kind === 'FULLTEXT' ? 'ft' : idx.kind === 'SPATIAL' ? 'sp' : 'idx'}_${
        idx.columns.map((id) => columnName(def, id)).join('_') || 'new'
    }`;

export const autoFkName = (def: TableDef, fk: ForeignKeyDef) =>
    `fk_${def.name || 'table'}_${fk.refTable || 'ref'}_${
        fk.columns.map((id) => columnName(def, id)).join('_') || 'col'
    }`;

export const columnSQL = (c: ColumnDef) => {
    const t = typeInfo(c.type);
    let type = c.type;
    if (t.param === 'values') {
        type += `(${splitValues(c.param).map(str).join(',')})`;
    } else if (t.param !== 'none' && c.param.trim()) {
        type += `(${c.param.replace(/\s+/g, '')})`;
    }
    const parts = [ident(c.name), type];
    if (c.unsigned && t.numeric) {
        parts.push('UNSIGNED');
    }
    if (c.collation && t.textual) {
        parts.push(`COLLATE ${c.collation}`);
    }
    parts.push(c.nullable && !c.primaryKey ? 'NULL' : 'NOT NULL');
    if (c.defaultMode === 'null') {
        parts.push('DEFAULT NULL');
    } else if (c.defaultMode === 'value') {
        parts.push(`DEFAULT ${str(c.defaultValue)}`);
    } else if (c.defaultMode === 'expression' && c.defaultValue.trim()) {
        parts.push(`DEFAULT ${c.defaultValue.trim()}`);
    }
    if (c.onUpdateNow && t.temporal) {
        parts.push('ON UPDATE CURRENT_TIMESTAMP');
    }
    if (c.autoIncrement) {
        parts.push('AUTO_INCREMENT');
    }
    if (c.comment) {
        parts.push(`COMMENT ${str(c.comment)}`);
    }
    return parts.join(' ');
};

const indexName = (def: TableDef, idx: IndexDef) => idx.name.trim() || autoIndexName(def, idx);
const fkName = (def: TableDef, fk: ForeignKeyDef) => fk.name.trim() || autoFkName(def, fk);

/** `KEY name (a, b(10))` */
export const indexSQL = (def: TableDef, idx: IndexDef) => {
    const kind = idx.kind === 'INDEX' ? 'KEY' : `${idx.kind} KEY`;
    const cols = idx.columns
        .map((id) => {
            const len = idx.lengths?.[id];
            return `${ident(columnName(def, id))}${len ? `(${len})` : ''}`;
        })
        .join(', ');
    return `${kind} ${ident(indexName(def, idx))} (${cols})`;
};

/** `CONSTRAINT name FOREIGN KEY (...) REFERENCES t (...) ON ...` */
export const fkSQL = (def: TableDef, fk: ForeignKeyDef) => {
    const cols = fk.columns.map((id) => ident(columnName(def, id))).join(', ');
    const refs = fk.refColumns.map(ident).join(', ');
    return `CONSTRAINT ${ident(fkName(def, fk))} FOREIGN KEY (${cols}) REFERENCES ${ident(
        fk.refTable
    )} (${refs}) ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`;
};

/**
 * Build the CREATE TABLE statement
 * @param def
 */
export function buildSQL(def: TableDef): string {
    const lines = def.columns.map(columnSQL);
    const pk = def.columns.filter((c) => c.primaryKey);
    if (pk.length) {
        lines.push(`PRIMARY KEY (${pk.map((c) => ident(c.name)).join(', ')})`);
    }
    def.indexes.forEach((idx) => lines.push(indexSQL(def, idx)));
    def.foreignKeys.forEach((fk) => lines.push(fkSQL(def, fk)));

    const o = def.options;
    const opts: string[] = [];
    if (o.engine) {
        opts.push(`ENGINE=${o.engine}`);
    }
    if (o.charset) {
        opts.push(`DEFAULT CHARSET=${o.charset}`);
    }
    if (o.collation) {
        opts.push(`COLLATE=${o.collation}`);
    }
    if (o.autoIncrementStart.trim()) {
        opts.push(`AUTO_INCREMENT=${o.autoIncrementStart.trim()}`);
    }
    if (o.comment) {
        opts.push(`COMMENT=${str(o.comment)}`);
    }

    return `CREATE TABLE ${ident(def.name || 'untitled')} (\n  ${lines.join(
        ',\n  '
    )}\n)${opts.length ? ` ${opts.join(' ')}` : ''};`;
}

/** what makes an index the same index , independent of column renames */
const indexShape = (idx: IndexDef) =>
    JSON.stringify([idx.kind, idx.columns, idx.columns.map((id) => idx.lengths?.[id] || 0)]);

const fkShape = (def: TableDef, fk: ForeignKeyDef) =>
    JSON.stringify([fkName(def, fk), fk.columns, fk.refTable, fk.refColumns, fk.onDelete, fk.onUpdate]);

/**
 * Ids of the longest run of columns whose original order is unchanged
 * @param ids kept column ids in their new order
 * @param origPos id => original index
 */
function stableColumns(ids: number[], origPos: Map<number, number>): Set<number> {
    const seq = ids.map((id) => origPos.get(id));
    const tails: number[] = [];
    const tailIdx: number[] = [];
    const parent: number[] = [];
    seq.forEach((v, i) => {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tails[mid] < v) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = v;
        tailIdx[lo] = i;
        parent[i] = lo > 0 ? tailIdx[lo - 1] : -1;
    });
    const keep = new Set<number>();
    for (let i = tailIdx[tails.length - 1] ?? -1; i >= 0; i = parent[i]) {
        keep.add(ids[i]);
    }
    return keep;
}

/**
 * The statements that turn `orig` into `cur` (both loaded / edited copies of the same table ,
 * columns , indexes and keys keep their ids)
 * @param orig as loaded from the server
 * @param cur edited
 */
export function buildAlterStatements(orig: TableDef, cur: TableDef): string[] {
    const table = ident(orig.origName || orig.name);
    const out: string[] = [];
    const alter = (clauses: string[]) =>
        clauses.length && out.push(`ALTER TABLE ${table}\n  ${clauses.join(',\n  ')};`);

    // foreign keys can't always be dropped and re-added in one ALTER , split them out
    const curFk = new Map(cur.foreignKeys.map((f) => [f.id, f]));
    const dropFks = orig.foreignKeys.filter((f) => {
        const c = curFk.get(f.id);
        return !c || fkShape(orig, f) !== fkShape(cur, c);
    });
    const addFks = cur.foreignKeys.filter(
        (f) => !f.origName || dropFks.some((d) => d.id === f.id)
    );
    alter(dropFks.map((f) => `DROP FOREIGN KEY ${ident(f.origName)}`));

    const clauses: string[] = [];
    const origCol = new Map(orig.columns.map((c) => [c.id, c]));
    const curIds = new Set(cur.columns.map((c) => c.id));

    // indexes : same shape + new name => RENAME INDEX , otherwise drop + add
    const curIdx = new Map(cur.indexes.map((i) => [i.id, i]));
    const addIdx: IndexDef[] = cur.indexes.filter((i) => !i.origName);
    orig.indexes.forEach((o) => {
        const c = curIdx.get(o.id);
        if (!c) {
            clauses.push(`DROP INDEX ${ident(o.origName)}`);
        } else if (indexShape(o) !== indexShape(c)) {
            clauses.push(`DROP INDEX ${ident(o.origName)}`);
            addIdx.push(c);
        } else if (indexName(cur, c) !== o.origName) {
            clauses.push(`RENAME INDEX ${ident(o.origName)} TO ${ident(indexName(cur, c))}`);
        }
    });

    const pkOrig = orig.columns.filter((c) => c.primaryKey).map((c) => c.id);
    const pkCur = cur.columns.filter((c) => c.primaryKey).map((c) => c.id);
    const pkChanged = JSON.stringify(pkOrig) !== JSON.stringify(pkCur);
    if (pkChanged && pkOrig.length) {
        clauses.push('DROP PRIMARY KEY');
    }

    orig.columns
        .filter((c) => !curIds.has(c.id))
        .forEach((c) => clauses.push(`DROP COLUMN ${ident(c.origName)}`));

    // columns that keep their relative order (longest increasing run of original positions)
    // stay put , every other kept column is moved after its new neighbour
    const origPos = new Map(orig.columns.map((c, i) => [c.id, i]));
    const stays = stableColumns(cur.columns.filter((c) => origPos.has(c.id)).map((c) => c.id), origPos);
    let prev: ColumnDef | null = null;
    cur.columns.forEach((c) => {
        const pos = prev ? `AFTER ${ident(prev.name)}` : 'FIRST';
        const o = origCol.get(c.id);
        const moved = !!o && !stays.has(c.id);
        if (!o) {
            clauses.push(`ADD COLUMN ${columnSQL(c)} ${pos}`);
        } else if (!c.locked && (moved || columnSQL(o) !== columnSQL(c))) {
            // generated columns are never rewritten , we don't load their expression
            clauses.push(
                `CHANGE COLUMN ${ident(o.origName)} ${columnSQL(c)}${moved ? ` ${pos}` : ''}`
            );
        }
        prev = c;
    });

    if (pkChanged && pkCur.length) {
        clauses.push(
            `ADD PRIMARY KEY (${cur.columns
                .filter((c) => c.primaryKey)
                .map((c) => ident(c.name))
                .join(', ')})`
        );
    }
    addIdx.forEach((i) => clauses.push(`ADD ${indexSQL(cur, i)}`));

    const o = orig.options;
    const n = cur.options;
    if (n.engine && n.engine !== o.engine) {
        clauses.push(`ENGINE=${n.engine}`);
    }
    if (n.charset && (n.charset !== o.charset || n.collation !== o.collation)) {
        clauses.push(`DEFAULT CHARSET=${n.charset}${n.collation ? ` COLLATE=${n.collation}` : ''}`);
    }
    if (n.comment !== o.comment) {
        clauses.push(`COMMENT=${str(n.comment)}`);
    }
    if (n.autoIncrementStart.trim() && n.autoIncrementStart !== o.autoIncrementStart) {
        clauses.push(`AUTO_INCREMENT=${n.autoIncrementStart.trim()}`);
    }
    alter(clauses);

    alter(addFks.map((f) => `ADD ${fkSQL(cur, f)}`));

    if (cur.name.trim() && cur.name.trim() !== (orig.origName || orig.name)) {
        out.push(`RENAME TABLE ${table} TO ${ident(cur.name.trim())};`);
    }
    return out;
}

/**
 * Everything that would make MySQL reject the statement (or do something surprising)
 * @param def
 * @param existingTables
 */
export function validate(def: TableDef, existingTables: string[]): Problem[] {
    const out: Problem[] = [];
    const add = (tab: Tab, field: string, message: string) =>
        out.push({ tab, field, message });

    if (!def.name.trim()) {
        add('columns', 'table:name', 'Table name is required');
    } else if (
        existingTables.some(
            (t) =>
                t.toLowerCase() === def.name.trim().toLowerCase() &&
                t !== def.origName
        )
    ) {
        add('columns', 'table:name', `A table named "${def.name}" already exists`);
    } else if (def.name.length > 64) {
        add('columns', 'table:name', 'Table name is longer than 64 characters');
    }

    if (!def.columns.length) {
        add('columns', 'columns', 'Add at least one column');
    }
    const seen = new Set<string>();
    def.columns.forEach((c, i) => {
        const label = c.name || `column ${i + 1}`;
        const t = typeInfo(c.type);
        if (!c.name.trim()) {
            add('columns', `col:${c.id}:name`, `Column ${i + 1} needs a name`);
        } else if (seen.has(c.name.toLowerCase())) {
            add('columns', `col:${c.id}:name`, `Duplicate column "${c.name}"`);
        }
        seen.add(c.name.toLowerCase());
        if (c.locked) {
            return;
        }

        if (t.param === 'required' && !c.param.trim()) {
            add('columns', `col:${c.id}:param`, `${label}: ${c.type} needs a length`);
        }
        if (t.param === 'values' && !splitValues(c.param).length) {
            add('columns', `col:${c.id}:param`, `${label}: ${c.type} needs at least one value`);
        }
        if (
            (t.param === 'required' || t.param === 'optional') &&
            c.param.trim() &&
            !/^\d+(\s*,\s*\d+)?$/.test(c.param.trim())
        ) {
            add('columns', `col:${c.id}:param`, `${label}: "${c.param}" isn't a valid length`);
        }
        if (c.autoIncrement && !t.integer && !['FLOAT', 'DOUBLE'].includes(c.type)) {
            add('columns', `col:${c.id}:ai`, `${label}: AUTO_INCREMENT needs a numeric column`);
        }
        if (c.autoIncrement) {
            const keyed =
                c.primaryKey ||
                def.indexes.some((idx) => idx.columns[0] === c.id);
            if (!keyed) {
                add(
                    'columns',
                    `col:${c.id}:ai`,
                    `${label}: an AUTO_INCREMENT column must be the primary key or the first column of an index`
                );
            }
        }
        if (c.defaultMode === 'value' && t.noDefault) {
            add('columns', `col:${c.id}:default`, `${label}: ${c.type} columns can't have a default value`);
        }
        if (c.defaultMode === 'null' && (!c.nullable || c.primaryKey)) {
            add('columns', `col:${c.id}:default`, `${label}: DEFAULT NULL on a NOT NULL column`);
        }
        if (c.defaultMode === 'expression' && !c.defaultValue.trim()) {
            add('columns', `col:${c.id}:default`, `${label}: enter a default expression`);
        }
        if (c.autoIncrement && c.defaultMode !== 'none') {
            add('columns', `col:${c.id}:default`, `${label}: AUTO_INCREMENT columns can't have a default`);
        }
        if (c.primaryKey && (t.noDefault && !t.spatial)) {
            add('columns', `col:${c.id}:pk`, `${label}: ${c.type} can't be part of a primary key without a prefix length , use VARCHAR instead`);
        }
    });
    if (def.columns.filter((c) => c.autoIncrement).length > 1) {
        add('columns', 'columns', 'Only one AUTO_INCREMENT column is allowed');
    }

    const indexNames = new Set<string>();
    def.indexes.forEach((idx, i) => {
        const name = (idx.name.trim() || autoIndexName(def, idx)).toLowerCase();
        if (!idx.columns.length) {
            add('indexes', `idx:${idx.id}:columns`, `Index ${i + 1} has no columns`);
        }
        if (indexNames.has(name)) {
            add('indexes', `idx:${idx.id}:name`, `Duplicate index name "${name}"`);
        }
        indexNames.add(name);
        idx.columns.forEach((id) => {
            const col = def.columns.find((c) => c.id === id);
            if (!col) {
                return;
            }
            const t = typeInfo(col.type);
            if (idx.kind === 'FULLTEXT' && !t.textual) {
                add('indexes', `idx:${idx.id}:columns`, `FULLTEXT index ${name}: ${col.name} isn't a text column`);
            }
            if (idx.kind === 'SPATIAL' && (!t.spatial || col.nullable)) {
                add('indexes', `idx:${idx.id}:columns`, `SPATIAL index ${name}: ${col.name} must be a NOT NULL spatial column`);
            }
            if (
                (idx.kind === 'INDEX' || idx.kind === 'UNIQUE') &&
                t.noDefault &&
                !t.spatial &&
                !idx.lengths?.[id]
            ) {
                add('indexes', `idx:${idx.id}:columns`, `Index ${name}: give ${col.name} a prefix length (e.g. 100) , ${col.type} can't be indexed whole`);
            }
        });
        if (idx.kind === 'SPATIAL' && idx.columns.length > 1) {
            add('indexes', `idx:${idx.id}:columns`, `SPATIAL index ${name} can only have one column`);
        }
    });

    def.foreignKeys.forEach((fk, i) => {
        const label = fk.name || `foreign key ${i + 1}`;
        if (!fk.columns.length) {
            add('foreignKeys', `fk:${fk.id}:columns`, `${label}: pick the local column(s)`);
        }
        if (!fk.refTable) {
            add('foreignKeys', `fk:${fk.id}:ref`, `${label}: pick the referenced table`);
        }
        if (fk.refTable && fk.refColumns.length !== fk.columns.length) {
            add(
                'foreignKeys',
                `fk:${fk.id}:refColumns`,
                `${label}: ${fk.columns.length} local column(s) but ${fk.refColumns.length} referenced`
            );
        }
        if (fk.onDelete === 'SET NULL' || fk.onUpdate === 'SET NULL') {
            fk.columns.forEach((id) => {
                const col = def.columns.find((c) => c.id === id);
                if (col && (!col.nullable || col.primaryKey)) {
                    add('foreignKeys', `fk:${fk.id}:columns`, `${label}: SET NULL needs ${col.name} to allow NULL`);
                }
            });
        }
    });
    if (def.foreignKeys.length && def.options.engine && def.options.engine !== 'InnoDB') {
        add('options', 'opt:engine', `Foreign keys need the InnoDB engine (${def.options.engine} ignores them)`);
    }

    if (def.options.autoIncrementStart.trim() && !/^\d+$/.test(def.options.autoIncrementStart.trim())) {
        add('options', 'opt:ai', 'AUTO_INCREMENT start must be a number');
    }
    return out;
}
