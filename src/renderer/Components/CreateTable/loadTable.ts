import {
    ColumnDef,
    DefaultMode,
    FkAction,
    ForeignKeyDef,
    IndexDef,
    IndexKind,
    TableDef,
    TYPES,
    typeInfo,
    uid,
} from './model';

/** "decimal(10,2) unsigned" => type , param , unsigned */
const parseType = (raw: string) => {
    const m = raw.match(/^(\w+)(?:\((.*)\))?(.*)$/);
    const base = (m ? m[1] : raw).toUpperCase();
    const args = m && m[2] ? m[2] : '';
    const rest = m ? m[3] : '';
    const known = TYPES.find((t) => t.name === base);
    let param = '';
    if (known?.param === 'values' || base === 'ENUM' || base === 'SET') {
        param = Array.from(args.matchAll(/'((?:[^']|'')*)'/g), (x) => x[1].replace(/''/g, "'")).join(', ');
    } else if (!known || known.param !== 'none') {
        // int(11) display widths are dropped , everything else keeps its arguments
        param = args;
    }
    const unsigned = /unsigned/i.test(rest);
    // tinyint(1) is how mysql stores BOOLEAN , keep it a boolean when the column is rewritten
    if (base === 'TINYINT' && args === '1' && !unsigned) {
        return { type: 'BOOLEAN', param: '', unsigned };
    }
    return { type: base, param, unsigned };
};

const parseDefault = (
    def: string | null,
    extra: string
): { defaultMode: DefaultMode; defaultValue: string } => {
    if (def === null || def === undefined) {
        return { defaultMode: 'none', defaultValue: '' };
    }
    if (/^current_timestamp/i.test(def)) {
        return { defaultMode: 'expression', defaultValue: def.toUpperCase() };
    }
    if (/DEFAULT_GENERATED/i.test(extra)) {
        return { defaultMode: 'expression', defaultValue: `(${def})` };
    }
    if (/^b'[01]*'$/i.test(def)) {
        return { defaultMode: 'expression', defaultValue: def };
    }
    return { defaultMode: 'value', defaultValue: def };
};

export function tableDefFromMetadata(metadata: import('main/util/sql_admin_commands').TableMetadata, table: string): TableDef {
    const { columns:cols,indexes:idx,foreignKeys:fks } = metadata;
    const info = [metadata.options];
    const columns: ColumnDef[] = cols.map((c) => {
        const extra = `${c.Extra || ''}`;
        const { type, param, unsigned } = parseType(`${c.Type}`);
        const textual = typeInfo(type).textual;
        return {
            id: uid(),
            origName: c.Field,
            locked: /VIRTUAL GENERATED|STORED GENERATED/i.test(extra),
            collation: textual && c.Collation ? c.Collation : undefined,
            name: c.Field,
            type,
            param,
            unsigned,
            nullable: c.Null === 'YES',
            primaryKey: c.Key === 'PRI',
            autoIncrement: /auto_increment/i.test(extra),
            ...parseDefault(c.Default, extra),
            onUpdateNow: /on update current_timestamp/i.test(extra),
            comment: c.Comment || '',
        };
    });
    const colId = (name: string) => columns.find((c) => c.name === name)?.id;

    const byName = new Map<string, any[]>();
    idx.forEach((r) => {
        if (r.Key_name !== 'PRIMARY') {
            byName.set(r.Key_name, [...(byName.get(r.Key_name) || []), r]);
        }
    });
    const indexes: IndexDef[] = Array.from(byName.entries()).map(([name, parts]) => {
        parts.sort((a, b) => a.Seq_in_index - b.Seq_in_index);
        const kind: IndexKind =
            parts[0].Index_type === 'FULLTEXT'
                ? 'FULLTEXT'
                : parts[0].Index_type === 'SPATIAL'
                ? 'SPATIAL'
                : Number(parts[0].Non_unique) === 0
                ? 'UNIQUE'
                : 'INDEX';
        const lengths: Record<number, number> = {};
        const ids = parts.map((part) => {
            const id = colId(part.Column_name);
            if (id !== undefined && part.Sub_part) {
                lengths[id] = Number(part.Sub_part);
            }
            return id;
        });
        return {
            id: uid(),
            origName: name,
            locked: ids.some((id) => id === undefined),
            kind,
            name,
            columns: ids.filter((id) => id !== undefined),
            lengths,
        };
    });

    const fkMap = new Map<string, ForeignKeyDef>();
    fks.forEach((r) => {
        const fk =
            fkMap.get(r.n) ||
            ({
                id: uid(),
                origName: r.n,
                name: r.n,
                columns: [],
                refTable: r.rt,
                refColumns: [],
                onDelete: r.d as FkAction,
                onUpdate: r.u as FkAction,
            } as ForeignKeyDef);
        const id = colId(r.c);
        if (id !== undefined) {
            fk.columns.push(id);
        }
        fk.refColumns.push(r.rc);
        fkMap.set(r.n, fk);
    });

    const t = info[0] || {};
    const collation = t.collation || '';
    return {
        origName: table,
        name: table,
        columns,
        indexes,
        foreignKeys: Array.from(fkMap.values()),
        options: {
            engine: t.engine || '',
            charset: collation ? collation.split('_')[0] : '',
            collation,
            autoIncrementStart: '',
            comment: t.comment || '',
        },
    };
}

/** deep copy keeping every id , the editor diffs the copy against the original */
export const cloneDef = (def: TableDef): TableDef => JSON.parse(JSON.stringify(def));
