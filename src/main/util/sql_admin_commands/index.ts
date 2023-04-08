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
    tableName: string;
    limit: number;
    offset: number;
    orderByCol: string;
    extraFilters: Filter[];
};

export abstract class AdminSQLCommand {
    abstract RenameTable(
        con: Sequelize,
        oldTableName: string,
        newTableName: string
    ): Promise<Error>;
    abstract ShowCreateTable(
        con: Sequelize,
        tableName: string
    ): Promise<string>;
    abstract ShowAllTables(con: Sequelize): Promise<Table[]>;
    abstract ShowCreateSQL(con: Sequelize, tableName: string): Promise<string>;
    abstract ShowSchema(
        con: Sequelize,
        tableName: string
    ): Promise<ColSchema[]>;
    abstract ListDatabases(con: Sequelize): Promise<string[]>;
    abstract GetSupportedTypes(): string[];

    TruncateTable(con: Sequelize, tableName: string): Promise<Error> {
        return con
            .query(`TRUNCATE TABLE ${tableName}`)
            .then(() => null)
            .catch((err) => err as Error);
    }

    DropTable(con: Sequelize, tableName: string): Promise<Error> {
        return con
            .query(`DROP TABLE ${tableName}`)
            .then(() => null)
            .catch((err) => err as Error);
    }

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

    async CloneTable(
        con: Sequelize,
        tableName: string,
        duplicateName: string,
        duplicateContent: boolean = false
    ): Promise<Error> {
        const t = await con.transaction();
        let err_: Error;
        try {
            await con.query(`CREATE TABLE ${duplicateName} LIKE ${tableName}`, {
                transaction: t,
            });
            if (duplicateContent) {
                await con.query(
                    `INSERT INTO ${duplicateName} SELECT * FROM ${tableName}`,
                    {
                        transaction: t,
                    }
                );
            }
            await t.commit();
        } catch (err) {
            err_ = err as Error;
            await t.rollback();
        }

        return err_;
    }

    SelectFromTable(con: Sequelize, s: SelectInput): Promise<any[]> {
        s.limit = s.limit ? s.limit : 20;
        s.offset = s.offset ? s.offset : 0;

        let filter: string = '';
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
        return con
            .query(
                `SELECT * FROM ${s.tableName} WHERE 1=1 ${filter} ${
                    s.orderByCol ? 'ORDER BY ' + s.orderByCol : ''
                }LIMIT ${s.limit} OFFSET ${s.offset}`,
                {
                    replacements: args,
                    type: QueryTypes.SELECT,
                }
            )
            .catch(() => []);
    }
}
