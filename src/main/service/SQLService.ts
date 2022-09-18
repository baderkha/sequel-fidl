import { DBType } from '../model/Connections';
import { Dialect } from 'sequelize';
import { Sequelize } from 'sequelize';
import {
    AdminSQLCommand,
    ColSchema,
    CreateColSchema,
    SelectInput,
    Table,
} from '../util/sql_admin_commands';
import { ConManager } from './Connections';
import { waitTillConnection } from './db/ConnectionFactory';
import { MYSQLAdminCommand } from '../util/sql_admin_commands/MYSQLAdminCommand';
import { ErrorTuple, NewErrorTuple } from '../util/tuple';
export type DialectInfoRes = {
    Dialect?: string;
    Version?: string;
};
/**
 *
 * SQL service, allows you to run supported queries for a connection id
 * @author Ahmad Baderkhan
 */
export class SQLService {
    private conMgr: ConManager;
    private adminSQLRunner: Map<DBType, AdminSQLCommand>;
    private static _instance: SQLService;

    constructor(conMgr: ConManager, runners: Map<DBType, AdminSQLCommand>) {
        this.conMgr = conMgr;
        this.adminSQLRunner = runners;
    }

    private rnr(dialect: string) {
        return this.adminSQLRunner.get(dialect as DBType);
    }

    static Default(): SQLService {
        if (!SQLService._instance) {
            let mp: Map<DBType, AdminSQLCommand> = new Map();
            mp.set('mysql', new MYSQLAdminCommand());
            SQLService._instance = new SQLService(ConManager.GetInstance(), mp);
        }
        return SQLService._instance;
    }

    /**
     * Get Dialect specific meta info
     * @param conID
     */
    async GetDialectInfo(conID: string): Promise<DialectInfoRes> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve({});
        }
        const dialect = con.getDialect();
        const version = await con.databaseVersion();

        return {
            Dialect: dialect,
            Version: version,
        };
    }
    /**
     * Run a random query
     * @param conID
     * @param query
     */
    RunManualQuery(conID: string, query: string): Promise<ErrorTuple<any[]>> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(
                NewErrorTuple([], new Error('no valid connection !'))
            );
        }
        return con
            .query(query)
            .then((data) => NewErrorTuple(data[0], null))
            .catch((err) => NewErrorTuple([], err));
    }
    /**
     * Get a list of tables + views
     * @param conID
     */
    ShowAllTables(conID: string): Promise<Table[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ShowAllTables(con);
    }
    /**
     * Get the DDL stmt for table
     * @param conID
     * @param tableName
     */
    ShowCreateSQL(conID: string, tableName: string): Promise<string> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve('');
        }
        return this.rnr(con.getDialect()).ShowCreateSQL(con, tableName);
    }
    /**
     * Get Schema for a table
     * @param conID
     * @param tableName
     */
    ShowSchema(conID: string, tableName: string): Promise<ColSchema[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ShowSchema(con, tableName);
    }
    /**
     * Get all the schemas for a db
     * @param conID
     */
    ListDatabases(conID: string): Promise<string[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve([]);
        }
        return this.rnr(con.getDialect()).ListDatabases(con);
    }

    GetSupportedTypes(conID: string): string[] {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            const res: string[] = [];
            return res;
        }
        return this.rnr(con.getDialect()).GetSupportedTypes();
    }

    /**
     * Switches data bases without changing the connection id
     * @param conID
     * @param dbName
     */
    async SwitchDataBase(conID: string, dbName: string): Promise<Error> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return Promise.resolve(new Error('Could not find connection id'));
        }
        let dbs = await this.ListDatabases(conID);
        if (!dbs.includes(dbName)) {
            return Promise.resolve(
                new Error(`${dbName} was not found for this connection `)
            );
        }
        const newCon = new Sequelize(
            dbName,
            con.config.username,
            con.config.password,
            {
                host: con.config.host,
                port: parseInt(con.config.port),
                dialect: con.getDialect() as Dialect,
            }
        );

        const err = await waitTillConnection(con);
        if (err != null) {
            return err;
        }

        await this.conMgr.Remove(conID, true);

        // add with specific con id
        this.conMgr.Add(newCon, conID);
        return null;
    }

    /**
     * Create a table
     * @param conID
     * @param tableName
     * @param schema
     */
    CreateTable(
        conID: string,
        tableName: string,
        schema: CreateColSchema[]
    ): Promise<Error> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).CreateTable(con, tableName, schema);
    }

    /**
     * Select from a table and paginate + filter
     * @param conID
     * @param s
     */
    SelectFromTable(conID: string, s: SelectInput): Promise<any[]> {
        const [_, con] = this.conMgr.GetConById(conID);
        if (!con) {
            return null;
        }
        return this.rnr(con.getDialect()).SelectFromTable(con, s);
    }
}
