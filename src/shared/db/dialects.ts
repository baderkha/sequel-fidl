export type DatabaseType = 'mysql' | 'postgres';

export const DATABASES = {
    mysql: {
        label: 'MySQL',
        port: 3306,
        username: 'root',
        database: '',
        version: '8.4',
        transactionalDDL: false,
    },
    postgres: {
        label: 'PostgreSQL',
        port: 5432,
        username: 'postgres',
        database: 'postgres',
        version: '17',
        transactionalDDL: true,
    },
};

export const databaseType = (type?: string): DatabaseType =>
    type === 'postgres' ? 'postgres' : 'mysql';

export function quoteIdentifier(
    name: string,
    dialect: DatabaseType = 'mysql'
): string {
    const quote = dialect === 'postgres' ? '"' : '`';
    return (
        quote +
        String(name)
            .split(quote)
            .join(quote + quote) +
        quote
    );
}

export function quoteTable(
    name: string,
    dialect: DatabaseType = 'mysql'
): string {
    return dialect === 'postgres'
        ? name
              .split('.')
              .map((part) => quoteIdentifier(part, dialect))
              .join('.')
        : quoteIdentifier(name, dialect);
}

export const nullComparison = (dialect: DatabaseType = 'mysql') =>
    dialect === 'postgres' ? 'IS NOT DISTINCT FROM' : '<=>';

export const sqlString = (value: string, dialect: DatabaseType = 'mysql') =>
    "'" +
    (dialect === 'mysql' ? value.replace(/\\/g, '\\\\') : value).replace(
        /'/g,
        "''"
    ) +
    "'";
