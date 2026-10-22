import '@testing-library/jest-dom';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { api } from '../renderer/api';
import { ConnectPane } from '../renderer/Pages/Welcome/ConnectPane';
import { PlaygroundsPane } from '../renderer/Pages/Welcome/PlaygroundsPane';
import { splitStatements } from '../shared/sql/statements';
import { quoteIdentifier, quoteTable } from '../shared/db/dialects';
import {
    deleteSQL,
    insertSQL,
    updateSQL,
} from '../renderer/Pages/DB/content/RowActions';
import {
    recordAssignments,
    toRecordDocument,
} from '../renderer/Pages/DB/content/documentValues';
import { CreateConnection } from '../main/service/db/ConnectionFactory';
import { Sequelize } from 'sequelize';
import { PostgresDocker } from '../main/util/db_process/Postgres';
import * as fs from 'fs';
import { analyze } from '../renderer/Components/SqlEditor/sqlContext';

jest.mock('../renderer/api', () => ({
    api: {
        listConnections: jest.fn(),
        testConnection: jest.fn(),
        saveConnection: jest.fn(),
        connect: jest.fn(),
        dockerAvailable: jest.fn(),
        listPlaygrounds: jest.fn(),
        listSamples: jest.fn(),
        createPlayground: jest.fn(),
    },
    onMainEvent: () => () => {},
}));
jest.mock('../renderer/Components/SqlEditor/SqlEditor', () => ({
    SqlEditor: () => null,
}));
jest.mock('docker-names', () => ({ getRandomName: () => 'sample_name' }));
jest.mock('find-free-ports', () => ({
    findFreePorts: () => Promise.resolve([55555]),
}));
jest.mock('uuid', () => ({ v4: () => 'postgres-test-id' }));
jest.mock('sequelize', () => ({ Sequelize: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), mkdirSync: jest.fn() }));

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (api.listConnections as jest.Mock).mockResolvedValue([]);
    (api.testConnection as jest.Mock).mockResolvedValue(['17.1', null]);
    (api.dockerAvailable as jest.Mock).mockResolvedValue(true);
    (api.listPlaygrounds as jest.Mock).mockResolvedValue([]);
    (api.listSamples as jest.Mock).mockResolvedValue([
        {
            type: 'mysql',
            id: 'world',
            name: 'World',
            description: 'MySQL sample',
            database: 'world',
        },
        {
            type: 'postgres',
            id: 'bookshop',
            name: 'Bookshop',
            description: 'PostgreSQL starter',
            database: 'main_db',
        },
    ]);
    (api.createPlayground as jest.Mock).mockResolvedValue([
        null,
        { message: 'Test request received' },
    ]);
});

it('offers PostgreSQL connections with the correct defaults and sends the selected engine', async () => {
    render(<ConnectPane onConnected={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
    });
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Database engine' }),
        { target: { value: 'postgres' } }
    );
    expect(screen.getByLabelText('Port')).toHaveValue('5432');
    expect(screen.getByLabelText('User')).toHaveValue('postgres');
    expect(screen.getByLabelText('Database')).toHaveValue('postgres');
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    });
    expect(api.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
            type: 'postgres',
            port: 5432,
            username: 'postgres',
            database: 'postgres',
        })
    );
    expect(
        screen.getByText('Connected to PostgreSQL 17.1')
    ).toBeInTheDocument();
});

it('restores saved engine and credentials while preserving custom ports on engine changes', async () => {
    (api.listConnections as jest.Mock).mockResolvedValue([
        {
            id: 1,
            type: 'postgres',
            name: 'Saved PG',
            host: 'localhost',
            port: 5433,
            username: 'reader',
            database: 'analytics',
            hasPassword: true,
        },
    ]);
    localStorage.setItem('sequel-fidl.last-connection', '1');
    render(<ConnectPane onConnected={jest.fn()} />);
    await waitFor(() =>
        expect(screen.getByLabelText('Database engine')).toHaveValue('postgres')
    );
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    });
    expect(api.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
            id: 1,
            type: 'postgres',
            port: 5433,
            password: undefined,
        })
    );
    fireEvent.change(screen.getByLabelText('Database engine'), {
        target: { value: 'mysql' },
    });
    expect(screen.getByLabelText('Port')).toHaveValue('5433');
});

it('filters starter datasets and versions by playground engine and submits numeric ports', async () => {
    render(<PlaygroundsPane onConnected={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
    });
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.queryByText('Bookshop')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Database engine'), {
        target: { value: 'postgres' },
    });
    expect(screen.getByText('Bookshop')).toBeInTheDocument();
    expect(screen.queryByText('World')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Version')).toHaveValue('17');
    fireEvent.click(screen.getByLabelText(/Bookshop/));
    fireEvent.change(screen.getByLabelText('Reserved Port'), {
        target: { value: '5544' },
    });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    });
    expect(api.createPlayground).toHaveBeenCalledWith(
        expect.objectContaining({
            type: 'postgres',
            version: '17',
            sample: 'bookshop',
            port: 5544,
        })
    );
});

it('opens PostgreSQL with PostgreSQL driver options and keeps MySQL options separate', async () => {
    const connection = {
        query: jest.fn().mockResolvedValue([]),
        close: jest.fn(),
    };
    (Sequelize as unknown as jest.Mock).mockImplementation(() => connection);
    const config = {
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'secret',
        database: '',
    };
    expect((await CreateConnection('postgres', config, 0))[1]).toBeNull();
    expect(Sequelize).toHaveBeenLastCalledWith(
        'postgres',
        'postgres',
        'secret',
        expect.objectContaining({
            dialect: 'postgres',
            dialectOptions: { connectionTimeoutMillis: 10000 },
        })
    );
    await CreateConnection('mysql', { ...config, port: 3306 }, 0);
    expect(Sequelize).toHaveBeenLastCalledWith(
        '',
        'postgres',
        'secret',
        expect.objectContaining({
            dialect: 'mysql',
            dialectOptions: expect.objectContaining({
                supportBigNumbers: true,
                multipleStatements: true,
            }),
        })
    );
});

it('uses the PostgreSQL container contract, credentials and persistent data layout', async () => {
    const docker: any = {
        RemoveContainer: jest.fn().mockResolvedValue(true),
        RunImage: jest.fn().mockResolvedValue([{}, null]),
    };
    {
        const process = new PostgresDocker(docker, '/tmp');
        const [out, error] = await process.StartUpFromExisting(
            '/tmp/sequel-postgres-test',
            '18',
            'pg-test'
        );
        expect(error).toBeNull();
        expect(out.UserName).toBe('postgres');
        expect(docker.RunImage).toHaveBeenCalledWith(
            'postgres',
            expect.objectContaining({
                ImageVersion: '18',
                PortInPortOut: [55555, 5432],
                VolumeBinding: [
                    '/tmp/sequel-postgres-test',
                    '/var/lib/postgresql',
                ],
            })
        );
        expect(docker.RunImage.mock.calls[0][1].EnvVarsMap.get('PGDATA')).toBe(
            '/var/lib/postgresql/data'
        );
        expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/sequel-postgres-test', {
            recursive: true,
        });
    }
});

it('uses dialect-specific SQL in previews and preserves PostgreSQL arrays and JSONB', () => {
    expect(quoteIdentifier('odd"name', 'postgres')).toBe('"odd""name"');
    expect(quoteTable('sales.orders', 'postgres')).toBe('"sales"."orders"');
    const key = { cols: ['id'], byAll: false };
    const sql = updateSQL(
        'sales.orders',
        [{ column: 'active', mode: 'value', value: true }],
        [{ id: 7 }],
        key,
        'postgres'
    );
    expect(sql).toContain('"active" = TRUE');
    expect(sql).toContain('IS NOT DISTINCT FROM');
    expect(sql).not.toContain('`');
    expect(
        deleteSQL(
            'orders',
            [{ value: null }],
            { cols: ['value'], byAll: true },
            'postgres'
        )
    ).toContain('SELECT tableoid,ctid');
    const schema: any = [
        { FieldName: 'tags', Type: 'text[]', NullAllowed: false },
        { FieldName: 'profile', Type: 'jsonb', NullAllowed: false },
    ];
    const row = { tags: ['one'], profile: { active: true } };
    const document = toRecordDocument(row, schema);
    document.tags = ['two'];
    document.profile = { active: false };
    expect(recordAssignments(row, schema, document)).toEqual([
        { column: 'tags', mode: 'value', value: ['two'] },
        { column: 'profile', mode: 'value', value: '{"active":false}' },
    ]);
    const insert = insertSQL(
        'orders',
        ['tags', 'profile'],
        [{ tags: ['one'], profile: [1, 2] }],
        'postgres',
        schema
    );
    expect(insert).toContain("ARRAY['one']");
    expect(insert).toContain("'[1,2]'");
});

it('splits PostgreSQL dollar-quoted routines and JSON operators correctly', () => {
    const sql = `DO $body$ BEGIN RAISE NOTICE 'hello; world'; END $body$; SELECT '{}'::jsonb #>> '{a}'; SELECT 2;`;
    expect(splitStatements(sql, 'postgres')).toHaveLength(3);
    expect(
        splitStatements("SELECT E'a\\'b;'; SELECT 2", 'postgres')
    ).toHaveLength(2);
    expect(splitStatements("SELECT '\\'; SELECT 2", 'postgres')).toHaveLength(
        2
    );
    expect(
        splitStatements(
            '/* outer /* inner */ ; still a comment */ SELECT 1; SELECT 2',
            'postgres'
        )
    ).toHaveLength(2);
});

it('completes quoted PostgreSQL tables and aliases without masking identifiers as strings', () => {
    const sql = 'SELECT b. FROM "sales"."books" AS "b"';
    expect(analyze(sql, 9, 'postgres')).toEqual(
        expect.objectContaining({
            kind: 'qualified',
            qualifier: 'b',
            scope: [{ table: 'sales.books', alias: 'b' }],
        })
    );
    const insert = 'INSERT INTO "sales"."books" (';
    expect(analyze(insert, insert.length, 'postgres')).toEqual(
        expect.objectContaining({
            kind: 'insert-columns',
            insertTable: 'sales.books',
        })
    );
    const json = "SELECT '{}'::jsonb #>> '{a}' FROM books WHERE ";
    expect(analyze(json, json.length, 'postgres').kind).toBe('column');
    const block = 'DO $$ BEGIN RAISE NOTICE ';
    expect(analyze(block, block.length, 'postgres').kind).toBe('none');
});
