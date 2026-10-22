import { MYSQLAdminCommand } from './MYSQLAdminCommand';
import { PostgresAdminCommand } from './PostgresAdminCommand';

const mysql = new MYSQLAdminCommand();
const postgres = new PostgresAdminCommand();
export const adminFor = (dialect: string) => {
    switch (dialect) {
        case 'mysql':
            return mysql;
        case 'postgres':
            return postgres;
        default:
            throw new Error(`Unsupported database type: ${dialect}`);
    }
};
