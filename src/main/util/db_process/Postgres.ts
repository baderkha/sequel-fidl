import { mkdirSync } from 'fs';
import { BaseDockerDB } from './BaseDockerDB';
import { DBProcStartOptions, DBProcTpl, DEFAULT_GENERATED_DB_NAME } from '.';
import { IDocker } from '../docker/DockerRunner';

const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export class PostgresDocker extends BaseDockerDB {
    constructor(
        docker: IDocker,
        basePath: string,
        private password = 'postgres'
    ) {
        super(docker, '/var/lib/postgresql', basePath);
    }
    async StartUpFromExisting(
        dataPath: string,
        version: string,
        id?: string,
        customPort?: string | number,
        opts: DBProcStartOptions = {}
    ): Promise<DBProcTpl> {
        const processID = id || this.generateContainerId();
        await this.docker.RemoveContainer(processID);
        mkdirSync(dataPath, { recursive: true });
        const port = Number(customPort) || (await this.getFreePort());
        const [, error] = await this.docker.RunImage('postgres', {
            ImageVersion: version,
            CustomContainerID: processID,
            PortInPortOut: [port, 5432],
            VolumeBinding: [dataPath, this.DbVolume],
            // Explicit PGDATA works across pre-18 and 18+ image layouts.
            EnvVarsMap: new Map([
                ['POSTGRES_USER', 'postgres'],
                ['POSTGRES_PASSWORD', this.password],
                ['POSTGRES_DB', DEFAULT_GENERATED_DB_NAME],
                ['PGDATA', '/var/lib/postgresql/data'],
            ]),
            Labels: opts.labels,
            OnProgress: opts.onProgress,
        });
        return error
            ? [null, error]
            : [
                  {
                      ProcessID: processID,
                      DBDatapath: dataPath,
                      Port: port,
                      UserName: 'postgres',
                      Password: this.password,
                      DefaultGeneratedDatabase: DEFAULT_GENERATED_DB_NAME,
                  },
                  null,
              ];
    }
    async ImportArchive(
        id: string,
        archive: string,
        files: string[],
        database = 'main_db'
    ): Promise<Error> {
        const dir = '/tmp/sequel-fidl-import';
        const psql = `PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER"`;
        const run = async (command: string) => {
            const result = await this.docker.Exec(id, ['sh', '-c', command]);
            if (result.exitCode !== 0)
                throw new Error(result.stderr || 'PostgreSQL import failed.');
        };
        try {
            await run(`mkdir -p ${dir}`);
            const error = await this.docker.CopyArchiveInto(id, archive, dir);
            if (error) return error;
            const ident = '"' + database.replace(/"/g, '""') + '"';
            await run(
                `${psql} -d postgres -c ${shellQuote(
                    `DROP DATABASE IF EXISTS ${ident}`
                )}`
            );
            await run(
                `${psql} -d postgres -c ${shellQuote(
                    `CREATE DATABASE ${ident}`
                )}`
            );
            for (const file of files)
                await run(
                    `${psql} -d ${shellQuote(database)} -f ${shellQuote(
                        `${dir}/${file}`
                    )}`
                );
            return null;
        } catch (err) {
            return err as Error;
        } finally {
            await this.docker.Exec(id, ['rm', '-rf', dir]).catch(() => {});
        }
    }
}
