import { ipcMain } from 'electron';
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
export class RenameTableEvent extends Event<
    { oldTable: string; newTable: string } & WithCon
> {}
export class CloneTableEvent extends Event<
    { oldTable: string; newTable: string; mustDuplicateData: boolean } & WithCon
> {}
export class ShowCreateTableEvent extends Event<
    { tableName: string } & WithCon
> {}

export class TruncateTableEvent extends ShowCreateTableEvent {}
export class DropTableEvent extends TruncateTableEvent {}
export class SelectFromTableEvent extends Event<{ s: SelectInput } & WithCon> {}

export const SQLEventController = (
    cboard: Electron.Clipboard,
    e: IpcMain,
    ser: SQLService
) => {
    e.handle('get_dialect_info', (_, arg: GetDialectInfoEvent) =>
        ser.GetDialectInfo(arg.Data.conID)
    );
    e.handle('run_manual_query', (_, arg: RunManualQueryEvent) =>
        ser.RunManualQuery(arg.Data.conID, arg.Data.query)
    );
    e.handle('show_all_tables', (_, arg: ShowAllTablesEvent) =>
        ser.ShowAllTables(arg.Data.conID)
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
    e.handle('rename_table', (_, arg: RenameTableEvent) =>
        ser.RenameTable(arg.Data.conID, arg.Data.oldTable, arg.Data.newTable)
    );
    e.handle('clone_table', (_, arg: CloneTableEvent) =>
        ser.CloneTable(
            arg.Data.conID,
            arg.Data.oldTable,
            arg.Data.newTable,
            arg.Data.mustDuplicateData
        )
    );
    e.handle('show_create_sql', async (_, arg: ShowCreateTableEvent) => {
        let res = await ser.ShowCreateSQL(arg.Data.conID, arg.Data.tableName);
        cboard.writeText(res);
    });
    e.handle('truncate_table', async (_, arg: TruncateTableEvent) =>
        ser.TruncateTable(arg.Data.conID, arg.Data.tableName)
    );
    e.handle('drop_table', async (_, arg: DropTableEvent) =>
        ser.DropTable(arg.Data.conID, arg.Data.tableName)
    );

};
