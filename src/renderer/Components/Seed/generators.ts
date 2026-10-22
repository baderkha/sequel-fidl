import { faker } from '@faker-js/faker/locale/en';
import type { ColSchema } from 'renderer/api';

/**
 * Fake data generators for seeding tables.
 * A column gets a generator (+ params) , values are then cast to fit the column's sql type.
 */

export type ColumnInfo = {
    name: string;
    /** raw sql type , e.g. varchar(255) */
    type: string;
    base: string;
    length?: number;
    scale?: number;
    unsigned: boolean;
    enumValues: string[];
    nullable: boolean;
    primaryKey: boolean;
    unique: boolean;
    autoIncrement: boolean;
    generated: boolean;
    hasDefault: boolean;
};

export type GenParams = {
    min?: number;
    max?: number;
    decimals?: number;
    /** comma separated , for "random from list" */
    choices?: string;
    /** fixed value */
    value?: string;
    /** existing values from another table */
    table?: string;
    column?: string;
    length?: number;
};

export type ParamKind = 'range' | 'decimals' | 'choices' | 'value' | 'lookup' | 'length';

export type GenContext = {
    index: number;
    col: ColumnInfo;
    /** values loaded for the lookup generator */
    lookup?: any[];
};

export type Generator = {
    id: string;
    label: string;
    group: string;
    params?: ParamKind[];
    make: (p: GenParams, ctx: GenContext) => any;
};

const pick = <T>(list: T[]) => (list.length ? faker.helpers.arrayElement(list) : null);

export const GENERATORS: Generator[] = [
    { id: 'skip', label: 'Skip (use column default)', group: 'Special', make: () => undefined },
    { id: 'null', label: 'NULL', group: 'Special', make: () => null },
    { id: 'constant', label: 'Fixed value', group: 'Special', params: ['value'], make: (p) => p.value ?? '' },
    { id: 'sequence', label: 'Sequence (1, 2, 3…)', group: 'Special', params: ['range'], make: (p, c) => (p.min ?? 1) + c.index },
    {
        id: 'choice',
        label: 'Random from list',
        group: 'Special',
        params: ['choices'],
        make: (p) => pick((p.choices || '').split(',').map((v) => v.trim()).filter(Boolean)),
    },
    {
        id: 'lookup',
        label: 'Existing value from table…',
        group: 'Special',
        params: ['lookup'],
        make: (_, c) => pick(c.lookup || []),
    },

    { id: 'firstName', label: 'First name', group: 'Person', make: () => faker.person.firstName() },
    { id: 'lastName', label: 'Last name', group: 'Person', make: () => faker.person.lastName() },
    { id: 'fullName', label: 'Full name', group: 'Person', make: () => faker.person.fullName() },
    { id: 'email', label: 'Email', group: 'Person', make: () => faker.internet.email().toLowerCase() },
    { id: 'username', label: 'Username', group: 'Person', make: () => faker.internet.username() },
    { id: 'phone', label: 'Phone number', group: 'Person', make: () => faker.phone.number() },
    { id: 'jobTitle', label: 'Job title', group: 'Person', make: () => faker.person.jobTitle() },
    { id: 'sex', label: 'Sex', group: 'Person', make: () => faker.person.sex() },
    { id: 'birthdate', label: 'Birthdate', group: 'Person', make: () => faker.date.birthdate() },
    { id: 'avatar', label: 'Avatar URL', group: 'Person', make: () => faker.image.avatar() },
    { id: 'password', label: 'Password', group: 'Person', make: () => faker.internet.password() },

    { id: 'street', label: 'Street address', group: 'Location', make: () => faker.location.streetAddress() },
    { id: 'city', label: 'City', group: 'Location', make: () => faker.location.city() },
    { id: 'state', label: 'State', group: 'Location', make: () => faker.location.state() },
    { id: 'zip', label: 'Zip code', group: 'Location', make: () => faker.location.zipCode() },
    { id: 'country', label: 'Country', group: 'Location', make: () => faker.location.country() },
    { id: 'countryCode', label: 'Country code', group: 'Location', make: () => faker.location.countryCode() },
    { id: 'latitude', label: 'Latitude', group: 'Location', make: () => faker.location.latitude() },
    { id: 'longitude', label: 'Longitude', group: 'Location', make: () => faker.location.longitude() },

    { id: 'url', label: 'URL', group: 'Internet', make: () => faker.internet.url() },
    { id: 'domain', label: 'Domain', group: 'Internet', make: () => faker.internet.domainName() },
    { id: 'ipv4', label: 'IPv4', group: 'Internet', make: () => faker.internet.ipv4() },
    { id: 'ipv6', label: 'IPv6', group: 'Internet', make: () => faker.internet.ipv6() },
    { id: 'userAgent', label: 'User agent', group: 'Internet', make: () => faker.internet.userAgent() },
    { id: 'slug', label: 'Slug', group: 'Internet', make: () => faker.lorem.slug() },

    { id: 'company', label: 'Company name', group: 'Business', make: () => faker.company.name() },
    { id: 'catchPhrase', label: 'Catch phrase', group: 'Business', make: () => faker.company.catchPhrase() },
    { id: 'product', label: 'Product name', group: 'Business', make: () => faker.commerce.productName() },
    { id: 'department', label: 'Department', group: 'Business', make: () => faker.commerce.department() },
    {
        id: 'price',
        label: 'Price',
        group: 'Business',
        params: ['range'],
        make: (p) => Number(faker.commerce.price({ min: p.min ?? 1, max: p.max ?? 500 })),
    },
    { id: 'currency', label: 'Currency code', group: 'Business', make: () => faker.finance.currencyCode() },
    { id: 'color', label: 'Color name', group: 'Business', make: () => faker.color.human() },

    { id: 'word', label: 'Word', group: 'Text', make: () => faker.lorem.word() },
    { id: 'words', label: 'A few words', group: 'Text', make: () => faker.lorem.words({ min: 2, max: 5 }) },
    { id: 'sentence', label: 'Sentence', group: 'Text', make: () => faker.lorem.sentence() },
    { id: 'paragraph', label: 'Paragraph', group: 'Text', make: () => faker.lorem.paragraph() },
    {
        id: 'alphanumeric',
        label: 'Random characters',
        group: 'Text',
        params: ['length'],
        make: (p) => faker.string.alphanumeric(p.length ?? 10),
    },

    {
        id: 'int',
        label: 'Integer',
        group: 'Numbers',
        params: ['range'],
        make: (p) => faker.number.int({ min: p.min ?? 0, max: p.max ?? 1000 }),
    },
    {
        id: 'decimal',
        label: 'Decimal',
        group: 'Numbers',
        params: ['range', 'decimals'],
        make: (p) =>
            faker.number.float({ min: p.min ?? 0, max: p.max ?? 1000, fractionDigits: p.decimals ?? 2 }),
    },
    { id:'array',label:'Text array',group:'Identifiers',make:() => [faker.lorem.word(),faker.lorem.word()] },
    { id: 'boolean', label: 'Boolean (0 / 1)', group: 'Numbers', make: () => (faker.datatype.boolean() ? 1 : 0) },

    { id: 'pastDate', label: 'Date in the past', group: 'Dates', make: () => faker.date.past({ years: 3 }) },
    { id: 'recentDate', label: 'Recent date (last week)', group: 'Dates', make: () => faker.date.recent({ days: 7 }) },
    { id: 'futureDate', label: 'Date in the future', group: 'Dates', make: () => faker.date.future() },
    { id: 'time', label: 'Time of day', group: 'Dates', make: () => faker.date.anytime() },
    { id: 'year', label: 'Year', group: 'Dates', make: () => faker.number.int({ min: 1970, max: 2030 }) },

    { id: 'uuid', label: 'UUID', group: 'Identifiers', make: () => faker.string.uuid() },
    {
        id: 'json',
        label: 'JSON object',
        group: 'Identifiers',
        make: () => ({ id: faker.string.uuid(), tag: faker.lorem.word(), score: faker.number.int(100) }),
    },
];

export const generator = (id: string) => GENERATORS.find((g) => g.id === id) || GENERATORS[0];

export const GENERATOR_GROUPS = Array.from(new Set(GENERATORS.map((g) => g.group)));

/**
 * Parse the column type mysql reports , e.g. "decimal(10,2) unsigned" / "enum('a','b')"
 * @param c
 */
export function columnInfo(c: ColSchema): ColumnInfo {
    const raw = (c.Type || '').toLowerCase().replace(/^character varying/,'varchar');
    const m = raw.match(/^(\w+)(?:\((.*)\))?/);
    const base = m ? m[1] : raw;
    const args = m && m[2] ? m[2] : '';
    let length: number;
    let scale: number;
    let enumValues: string[] = [];
    if (base === 'enum' || base === 'set') {
        enumValues = Array.from((c.Type || '').matchAll(/'((?:[^']|'')*)'/g), (x) =>
            x[1].replace(/''/g, "'")
        );
    } else if (args) {
        const [a, b] = args.split(',').map((x) => parseInt(x, 10));
        length = Number.isFinite(a) ? a : undefined;
        scale = Number.isFinite(b) ? b : undefined;
    }
    const extra = (c.Extra || '').toLowerCase();
    return {
        name: c.FieldName,
        type: c.Type,
        base,
        length,
        scale,
        unsigned: /unsigned/.test(raw),
        enumValues,
        nullable: c.NullAllowed,
        primaryKey: c.IsPrimaryKey,
        unique: !!c.IsUnique,
        autoIncrement: !!c.AutoIncrement,
        generated: /generated/.test(extra) && !/default_generated/.test(extra),
        hasDefault: c.Default !== null && c.Default !== undefined,
    };
}

const INT_MAX: Record<string, number> = {
    tinyint: 127,
    smallint: 32767,
    mediumint: 8388607,
    int: 2147483647,
    integer: 2147483647,
    bigint: Number.MAX_SAFE_INTEGER,
};

const isText = (b: string) => /char|text|blob|binary/.test(b);
const isInt = (b: string) => b in INT_MAX;
const isDecimal = (b: string) => /decimal|numeric|float|double|real/.test(b);
const isDateish = (b: string) => /^(date|datetime|timestamp|timestamptz)$/.test(b);

export type Suggestion = { gen: string; params: GenParams };

/**
 * Best guess generator from the column name and type
 * @param col
 * @param fk real foreign key target , if the table has one on this column
 * @param tables tables in the database (for *_id guesses)
 */
export function suggest(
    col: ColumnInfo,
    fk: { table: string; column: string } | undefined,
    tables: string[]
): Suggestion {
    const n = col.name.toLowerCase();
    const s = (gen: string, params: GenParams = {}): Suggestion => ({ gen, params });

    if (/\[\]$/.test(col.type)) return s(col.hasDefault ? 'skip' : 'array');
    if (col.base === 'uuid') return s('uuid');
    if (col.autoIncrement || col.generated) return s('skip');
    if (fk) return s('lookup', fk);
    if (col.enumValues.length) return s('choice', { choices: col.enumValues.join(', ') });
    if (col.hasDefault && /^(created|updated|modified|inserted)(_at|_on|_date)?$|last_update/.test(n)) return s('skip');

    if (/(^|_)uuid$|(^|_)guid$/.test(n) || (col.base === 'char' && col.length === 36)) return s('uuid');
    if (/e-?mail/.test(n)) return s('email');
    if (/^first_?name$|^fname$|^given_?name$/.test(n)) return s('firstName');
    if (/^last_?name$|^lname$|^surname$|^family_?name$/.test(n)) return s('lastName');
    if (/^(full_?)?name$|display_?name|author|contact/.test(n)) return s('fullName');
    if (/user_?name|login|handle|nick/.test(n)) return s('username');
    if (/phone|mobile|cell|fax/.test(n)) return s('phone');
    if (/password|passwd|pass_?hash/.test(n)) return s('password');
    if (/avatar|photo|picture|image|thumbnail/.test(n)) return s('avatar');
    if (/address|street/.test(n)) return s('street');
    if (/city|town/.test(n)) return s('city');
    if (/^state$|province|region/.test(n)) return s('state');
    if (/zip|postal|postcode/.test(n)) return s('zip');
    if (/country_?code|iso/.test(n)) return s('countryCode');
    if (/country/.test(n)) return s('country');
    if (/^lat(itude)?$/.test(n)) return s('latitude');
    if (/^(lng|lon|long|longitude)$/.test(n)) return s('longitude');
    if (/url|website|link|homepage/.test(n)) return s('url');
    if (/domain|host/.test(n)) return s('domain');
    if (/ip_?addr|^ip$/.test(n)) return s('ipv4');
    if (/user_?agent/.test(n)) return s('userAgent');
    if (/slug/.test(n)) return s('slug');
    if (/company|organi[sz]ation|employer/.test(n)) return s('company');
    if (/job|occupation|position/.test(n)) return s('jobTitle');
    if (/product|item_?name/.test(n)) return s('product');
    if (/department|category/.test(n) && isText(col.base)) return s('department');
    if (/currency/.test(n)) return s('currency');
    if (/colou?r/.test(n)) return s('color');
    if (/gender|^sex$/.test(n)) return s('sex');
    if (/birth|dob/.test(n)) return s('birthdate');
    if (/title|subject|headline|summary/.test(n) && isText(col.base)) return s('sentence');
    if (/desc|bio|body|content|text|notes?|comment|message|about/.test(n)) return s('paragraph');

    if (col.base === 'tinyint' && col.length === 1) return s('boolean');
    if (col.base === 'bit' || col.base === 'boolean' || /^(is|has|can|should)_|active|enabled|verified|deleted$/.test(n)) {
        if (isInt(col.base) || col.base === 'bit' || col.base === 'boolean') return s('boolean');
    }
    // user_id => users.id when there's no real foreign key
    const idMatch = n.match(/^(\w+?)_?id$/);
    if (idMatch && isInt(col.base) && !col.primaryKey) {
        const base = idMatch[1];
        const table = tables.find((t) => [base, `${base}s`, `${base}es`].includes(t.toLowerCase()));
        if (table) return s('lookup', { table, column: 'id' });
    }
    if (/price|amount|cost|total|salary|balance|fee/.test(n)) return s(isInt(col.base) ? 'int' : 'price', { min: 1, max: 500 });
    if (/^age$/.test(n)) return s('int', { min: 18, max: 90 });
    if (/qty|quantity|count|stock|inventory|views|likes/.test(n)) return s('int', { min: 0, max: 100 });
    if (/rating|score|stars/.test(n)) return s('int', { min: 1, max: 5 });
    if (/year/.test(n) || col.base === 'year') return s('year');

    // fall back on the type
    if (col.primaryKey && isInt(col.base)) return s('sequence', { min: 1 });
    if (isInt(col.base)) return s('int', { min: col.unsigned ? 0 : 0, max: Math.min(INT_MAX[col.base], 1000) });
    if (isDecimal(col.base)) return s('decimal', { min: 0, max: 1000, decimals: col.scale ?? 2 });
    if (col.base === 'date') return s('pastDate');
    if (isDateish(col.base)) return s(/expire|due|until|end/.test(n) ? 'futureDate' : 'pastDate');
    if (col.base === 'time') return s('time');
    if (/^jsonb?$/.test(col.base)) return s('json');
    if (/blob|binary/.test(col.base)) return s(col.nullable ? 'null' : 'constant', { value: '' });
    if (/text/.test(col.base)) return s('paragraph');
    if (col.base === 'char') return s('alphanumeric', { length: col.length || 1 });
    if (/char/.test(col.base)) return s(col.length && col.length < 12 ? 'word' : 'words');
    return s(col.nullable ? 'null' : 'words');
}

const pad = (n: number) => `${n}`.padStart(2, '0');
const sqlDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sqlTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const sqlDateTime = (d: Date) => `${sqlDate(d)} ${sqlTime(d)}`;

/**
 * Make a generated value fit the column (truncate strings , format dates , clamp ints)
 * @param v
 * @param col
 */
export function castValue(v: any, col: ColumnInfo): any {
    if (v === null || v === undefined) {
        return v;
    }
    if (v instanceof Date) {
        if (col.base === 'date') return sqlDate(v);
        if (col.base === 'time') return sqlTime(v);
        if (col.base === 'year') return v.getFullYear();
        if (isDateish(col.base)) return sqlDateTime(v);
        return sqlDateTime(v);
    }
    if (col.base === 'boolean' || col.base === 'bool') return Boolean(v);
    if (/\[\]$/.test(col.type)) return Array.isArray(v) ? v : [v];
    if (typeof v === 'object') {
        return JSON.stringify(v);
    }
    if (isInt(col.base) && typeof v === 'number') {
        const max = col.unsigned ? INT_MAX[col.base] * 2 + 1 : INT_MAX[col.base];
        const min = col.unsigned ? 0 : -INT_MAX[col.base] - 1;
        return Math.min(max, Math.max(min, Math.round(v)));
    }
    if (isText(col.base) && col.length && typeof v === 'string' && v.length > col.length) {
        return v.slice(0, col.length);
    }
    if (typeof v === 'boolean') {
        return v ? 1 : 0;
    }
    return v;
}
