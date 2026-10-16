import { ContainerState } from '../docker/DockerRunner';

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

export type DBProcStartOptions = {
    /** human readable progress , e.g. image pull */
    onProgress?: (message: string) => void;
    /** labels for the process (container) so the app can find what it owns */
    labels?: Record<string, string>;
};

export const DEFAULT_GENERATED_DB_NAME = 'main_db';
/**
 * A contract for database processes to fullfill
 */
export interface IDBProcess {
    /**
     * Can processes be started at all (e.g. is docker running)
     */
    IsAvailable(): Promise<boolean>;
    /**
     * Start up a new instance of db
     * Specify DB version
     * @param version
     */
    StartUp(version: string, opts?: DBProcStartOptions): Promise<DBProcTpl>;
    /**
     * Startup from an existing pool of data
     * @param dataPath
     * @param version
     * @param processID reuse this process id (container name)
     */
    StartUpFromExisting(
        dataPath: string,
        version: string,
        processID?: string,
        opts?: DBProcStartOptions
    ): Promise<DBProcTpl>;
    /**
     * Gracefully shut down the process , the data is kept unless a state path is given
     * @param processID
     */
    ShutDown(processID: string, statePathToDelete?: string): Promise<boolean>;
    /**
     * Removes state files for playground
     * @param statePathToDelete
     */
    DeleteState(statePathToDelete: string): Promise<void>;
    /**
     * Is the process running
     * @param processID
     */
    State(processID: string): Promise<ContainerState>;
    /**
     * Run sql files from an archive with the database's own cli (supports DELIMITER etc.)
     * @param processID
     * @param archivePath (gzipped) tar on the host
     * @param sqlFiles paths inside the archive , run in order
     * @param dropDatabase drop this database first so a failed import can be retried
     */
    ImportArchive(
        processID: string,
        archivePath: string,
        sqlFiles: string[],
        dropDatabase?: string
    ): Promise<Error>;
}
