import {
    Binary,
    Braces,
    CalendarDays,
    CircleHelp,
    Clock3,
    Hash,
    List,
    MapPin,
    ToggleLeft,
    Type,
} from 'lucide-react';

/** Compact header hints; the original SQL type stays available in the tooltip. */
export function columnTypeHint(typeLabel: string) {
    const type = typeLabel.trim().toLowerCase().match(/^[a-z]+/)?.[0] || '';
    const hintType = type !== 'enum' && typeLabel.includes('[]') ? 'array' : type;

    switch (hintType) {
        case 'enum':
            return { Icon: null, text: 'enum' };
        case 'array':
        case 'set':
            return { Icon: List, text: '' };
        case 'bool':
        case 'boolean':
            return { Icon: ToggleLeft, text: '' };
        case 'tinyint':
        case 'smallint':
        case 'mediumint':
        case 'int':
        case 'integer':
        case 'bigint':
        case 'decimal':
        case 'numeric':
        case 'dec':
        case 'fixed':
        case 'float':
        case 'double':
        case 'real':
        case 'serial':
        case 'money':
            return { Icon: Hash, text: '' };
        case 'date':
        case 'datetime':
        case 'timestamp':
        case 'timestamptz':
        case 'year':
            return { Icon: CalendarDays, text: '' };
        case 'time':
        case 'timetz':
        case 'interval':
            return { Icon: Clock3, text: '' };
        case 'json':
        case 'jsonb':
            return { Icon: Braces, text: '' };
        case 'binary':
        case 'varbinary':
        case 'tinyblob':
        case 'blob':
        case 'mediumblob':
        case 'longblob':
        case 'bit':
        case 'bytea':
            return { Icon: Binary, text: '' };
        case 'geometry':
        case 'point':
        case 'linestring':
        case 'polygon':
        case 'multipoint':
        case 'multilinestring':
        case 'multipolygon':
        case 'geometrycollection':
        case 'geography':
            return { Icon: MapPin, text: '' };
        case 'char':
        case 'varchar':
        case 'nchar':
        case 'nvarchar':
        case 'tinytext':
        case 'text':
        case 'mediumtext':
        case 'longtext':
        case 'citext':
        case 'uuid':
        case 'xml':
            return { Icon: Type, text: '' };
        default:
            return { Icon: CircleHelp, text: '' };
    }
}
