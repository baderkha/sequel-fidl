import { Sequelize } from 'sequelize';
import { ColSchema, AdminSQLCommand, Table } from '.';

/**
 * MYSQL Admin command runner
 * @author Ahmad Baderkhan
 */
export class MYSQLAdminCommand extends AdminSQLCommand {
    ShowCreateTable(con: Sequelize, tableName: string): Promise<string> {
        return con
            .query(`SHOW CREATE TABLE ${tableName}`)
            .then((res) => res[0] as string)
            .catch(() => '');
    }
    RenameTable(
        con: Sequelize,
        oldTableName: string,
        newTableName: string
    ): Promise<Error> {
        return con
            .query(`RENAME TABLE ${oldTableName} TO ${newTableName}`)
            .then(() => null)
            .catch((err) => err);
    }

    ShowAllTables(con: Sequelize): Promise<Table[]> {
        return con
            .query('SHOW FULL TABLES')
            .then((data) => {
                return data[0].map((obj: any) => {
                    const tbl: Table = {
                        Name: obj['Tables_in_' + con.getDatabaseName()],
                        Type:
                            (obj['Table_type'] as string)
                                .toLowerCase()
                                .indexOf('view') > 0
                                ? 'view'
                                : 'table',
                    };
                    return tbl;
                });
            })
            .catch(() => []);
    }

    ShowCreateSQL(con: Sequelize, tableName: string): Promise<string> {
        return con
            .query(`SHOW CREATE TABLE ${tableName}`)
            .then((data) => {
                const dat = data[0][0];
                const idx = 'Create Table';
                return (dat as any)[idx];
            })
            .catch(() => '');
    }

    ShowSchema(con: Sequelize, tableName: string): Promise<ColSchema[]> {
        return con
            .query(`DESCRIBE ${tableName}`)
            .then((data) => {
                return data[0].map((res) => {
                    const col: ColSchema = {
                        FieldName: (res as any)['Field'],
                        Type: (res as any)['Type'],
                        IsPrimaryKey: (res as any)['Key'] == 'PRI',
                        Default: (res as any)['Default'],
                        NullAllowed: (res as any)['Null'] == 'YES',
                        JsFriendlyType: this.resolveJSType(
                            (res as any)['Type']
                        ),
                    };
                    return col;
                });
            })
            .catch(() => []);
    }

    ListDatabases(con: Sequelize): Promise<string[]> {
        return con
            .query('SHOW DATABASES')
            .then((data) => {
                return data[0].map((obj: any) => {
                    return obj['Database'];
                });
            })
            .catch(() => []);
    }

    private resolveJSType(t: string): string {
        let type = t.toLowerCase();
        if (
            type.indexOf('text') >= 0 ||
            type.indexOf('char') >= 0 ||
            type.indexOf('enum') >= 0
        ) {
            return 'string';
        }

        if (
            type.indexOf('int') >= 0 ||
            type.indexOf('double') >= 0 ||
            type.indexOf('float') >= 0 ||
            type.indexOf('year') >= 0
        ) {
            return 'number';
        }

        if (type.indexOf('date') >= 0 || type.indexOf('time') >= 0) {
            return 'Date';
        }
        return '';
    }

    GetSupportedTypes(): string[] {
        return [
            'TINYTEXT',
            'TEXT',
            'MEDIUMTEXT',
            'LONGTEXT',
            'TINYBLOB',
            'BLOB',
            'MEDIUMBLOBL',
            'LONGBLOB',
            'VARCHAR',
            'CHAR',
            'enum',
            'SET',
            'TINYINT',
            'SMALLINT',
            'INT',
            'MEDIUMINT',
            'BIGINT',
            'DOUBLE',
            'FLOAT',
            'BIT',
            'DATE',
            'DATETIME',
            'TIME',
            'TIMESTAMP',
            'YEAR',
            'GEOMETRY',
            'POINT',
            'LINESTRING',
            'POLYGON',
            'MULTIPOINT',
            'MULTILINESTRING',
            'MULTIPOLYGON',
            'GEOMETRYCOLLECTION',
        ];
    }
}
