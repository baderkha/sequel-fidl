import { QueryTypes, Sequelize } from 'sequelize';

export type FilterOperations =
    | '>'
    | '<'
    | '>='
    | '<='
    | '<>'
    | '='
    | 'LIKE'
    | 'IS NULL'
    | 'IS NOT NULL'
    | 'IN';

/**
 * Table Type
 */
export type Table = {
    Name: string;
    Type: 'table' | 'view';
};

/**
 * For Viewing on the client side , it also provides js friendly type
 */
export type ColSchema = CreateColSchema & {
    JsFriendlyType: string;
};

/**
 * Create col schema , used to create a table
 */
export type CreateColSchema = {
    FieldName: string;
    Type: string;
    NullAllowed: boolean;
    Default: any;
    IsPrimaryKey: boolean;
};

export type Filter = {
    Column: string;
    Operation: FilterOperations;
    Value: any;
};

export type SelectInput = {
    con: Sequelize;
    tableName: string;
    limit: number;
    offset: number;
    orderByCol: string;
    extraFilters: Filter[];
};

export abstract class AdminSQLCommand {
    abstract ShowAllTables(con: Sequelize): Promise<Table[]>;
    abstract ShowCreateSQL(con: Sequelize, tableName: string): Promise<string>;
    abstract ShowSchema(
        con: Sequelize,
        tableName: string
    ): Promise<ColSchema[]>;
    abstract ListDatabases(con: Sequelize): Promise<string[]>;
    abstract GetSupportedTypes(): string[];

    CreateTable(
        con: Sequelize,
        tableName: string,
        schema: CreateColSchema[]
    ): Promise<Error> {
        const pks = schema
            .filter((val) => val.IsPrimaryKey)
            .map((val) => val.FieldName);
        const schemaOut = schema.map(
            (val) =>
                `${val.FieldName} ${val.Type.toUpperCase()} ${
                    val.NullAllowed ? 'NULL' : 'NOT NULL'
                } ${val.Default}`
        );

        return con
            .query(
                `CREATE TABLE ${tableName}(
                ${schemaOut.join(',\n')}
                ${
                    pks.length > 0
                        ? ',\nprimary key (' + pks.join(' , ') + ')'
                        : ''
                }
            );`
            )
            .then(() => null)
            .catch((err) => err);
    }

    SelectFromTable(s: SelectInput): Promise<any[]> {
        s.limit = s.limit ? s.limit : 20;
        s.offset = s.offset ? s.offset : 0;

        let filter: string;
        let args: any[] = [];
        if (s.extraFilters && s.extraFilters.length > 0) {
            let filters = s.extraFilters.map((filter) => {
                args.push(filter.Value);

                return `${filter.Column} ${filter.Operation} ${
                    filter.Operation == 'IN' ? '(?)' : ''
                }`;
            });

            filter = ` AND ${filters.join(' AND ')} `;
        }
        return s.con.query(
            `SELECT * FROM ${s.tableName} WHERE 1=1 ${filter} ${
                s.orderByCol ? 'ORDER BY ' + s.orderByCol : ''
            }LIMIT ${s.limit} OFFSET ${s.offset}`,
            {
                replacements: args,
                type: QueryTypes.SELECT,
            }
        );
    }
}
