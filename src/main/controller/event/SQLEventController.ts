import { IpcMain } from 'electron';
import { SQLService } from 'main/service/SQLService';
import { CreateColSchema, SelectInput } from 'main/util/sql_admin_commands';
import { Event } from '../../util/event';

type WithCon = {
    conID: string;
};

export class GetDialectInfoEvent extends Event<WithCon> {}
export class RunManualQueryEvent extends Event<{ query: string } & WithCon> {}
export class ShowAllTablesEvent extends Event<WithCon> {}
export class ShowCreateSQLEvent extends Event<
    { tableName: string } & WithCon
> {}
export class ShowSchemaEvent extends Event<{ tableName: string } & WithCon> {}
export class ListDatabasesEvent extends Event<WithCon> {}
export class GetSupportedTypesEvent extends Event<WithCon> {}
export class SwitchDataBaseEvent extends Event<{ dbName: string } & WithCon> {}
export class CreateTableEvent extends Event<
    { tableName: string; schema: CreateColSchema[] } & WithCon
> {}
export class SelectFromTableEvent extends Event<{ s: SelectInput } & WithCon> {}

export const SQLEventController = (e: IpcMain, ser: SQLService) => {
    e.handle('get_dialect_info', (_, arg: GetDialectInfoEvent) =>
        ser.GetDialectInfo(arg.Data.conID)
    );
    e.handle('run_manual_query', (_, arg: RunManualQueryEvent) =>
        ser.RunManualQuery(arg.Data.conID, arg.Data.query)
    );
    e.handle('show_all_tables', (_, arg: ShowAllTablesEvent) =>
        ser.ShowAllTables(arg.Data.conID)
    );
    e.handle('show_create_sql', (_, arg: ShowCreateSQLEvent) =>
        ser.ShowCreateSQL(arg.Data.conID, arg.Data.tableName)
    );
    e.handle('show_schema', (_, arg: ShowSchemaEvent) =>
        ser.ShowSchema(arg.Data.conID, arg.Data.tableName)
    );
    e.handle('list_databases', (_, arg: ListDatabasesEvent) =>
        ser.ListDatabases(arg.Data.conID)
    );
    e.handle('get_supported_types', (_, arg: GetSupportedTypesEvent) =>
        ser.GetSupportedTypes(arg.Data.conID)
    );
    e.handle('switch_database', (_, arg: SwitchDataBaseEvent) =>
        ser.SwitchDataBase(arg.Data.conID, arg.Data.dbName)
    );
    e.handle('create_table', (_, arg: CreateTableEvent) =>
        ser.CreateTable(arg.Data.conID, arg.Data.tableName, arg.Data.schema)
    );
    e.handle('select_from_table', (_, arg: SelectFromTableEvent) =>
        ser.SelectFromTable(arg.Data.conID, arg.Data.s)
    );
};
