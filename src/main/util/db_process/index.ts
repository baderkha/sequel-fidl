export type DBProcStartOut = {
    ProcessID: string;
    DBDatapath: string;
    Port: number;
    UserName: string;
    Password: string;
    DefaultGeneratedDatabase: string;
};
export type DBProcTpl = [DBProcStartOut, Error];
export type DBProcStatusTpl = [boolean, Error];

export const DEFAULT_GENERATED_DB_NAME = 'main_db';
/**
 * A contract for database processes to fullfill
 */
export interface IDBProcess {
    /**
     * Start up a new instance of db
     * Specify DB version
     * @param version
     */
    StartUp(version: string): Promise<DBProcTpl>;
    /**
     * Startup from an existing pool of data
     * @param dataPath
     * @param version
     */
    StartUpFromExisting(dataPath: string, version: string): Promise<DBProcTpl>;
    /**
     * Shut Down the process running
     * @param processID
     */
    ShutDown(processID: string, statePathToDelete?: string): Promise<boolean>;
    /**
     * Removes state files for playground
     * @param statePathToDelete
     */
    DeleteState(statePathToDelete: string): Promise<void>;
}
