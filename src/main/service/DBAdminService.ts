import { DBType } from 'main/model/Connections';
import { AdminSQLCommand } from 'main/util/sql_admin_commands';
import { ConManager } from './Connections';

export class DBAdminService {
    private conMgr: ConManager;
    private adminSQLRunner: Map<DBType, AdminSQLCommand>;

    constructor(conMgr: ConManager, runners: Map<DBType, AdminSQLCommand>) {
        this.conMgr = conMgr;
        this.adminSQLRunner = runners;
    }

    private rnr(dialect: string) {
        return this.adminSQLRunner.get(dialect as DBType);
    }

    RunPlainQuery(conID: string, query: string): Promise<any[]> {}
}
