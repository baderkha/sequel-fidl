/** @jest-environment node */
import { QueryTypes, Sequelize } from 'sequelize';
import { PostgresAdminCommand } from '../main/util/sql_admin_commands/PostgresAdminCommand';

const admin = new PostgresAdminCommand();

it.each([
    {
        name: 'a single record',
        columns: ['name'],
        rows: [['Alice']],
        count: 1,
        perQuery: 1,
    },
    {
        name: 'multiple records',
        columns: ['name'],
        rows: [['Alice'], ['Bob']],
        count: 2,
        perQuery: 2,
    },
    {
        name: 'a generated-ID-only record',
        columns: [],
        rows: [[]],
        count: 1,
        perQuery: 1,
    },
    {
        name: 'multiple generated-ID-only records',
        columns: [],
        rows: [[], []],
        count: 2,
        perQuery: 1,
    },
    {
        name: 'a skipped conflicting record',
        columns: ['name'],
        rows: [['Alice']],
        count: 0,
        perQuery: 0,
    },
])(
    'returns Sequelize’s numeric affected-row count for $name',
    async ({ columns, rows, count, perQuery }) => {
        // Sequelize PostgreSQL INSERT returns [returnedRows, affectedRows], even
        // when the SQL is issued through query() without a model.
        const query = jest.fn().mockResolvedValue([[], perQuery]);
        const savepoint = {};
        const transaction = jest.fn(async (_options, run) => run(savepoint));
        const con = { query, transaction } as unknown as Sequelize;
        await expect(
            admin.InsertRows(con, 'people', columns, rows, count === 0)
        ).resolves.toEqual([count, null]);
        expect(query).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ type: QueryTypes.INSERT })
        );
    }
);

it('returns the insert count inside an existing transaction', async () => {
    const parent: any = { id: 'parent' };
    const savepoint = { id: 'savepoint' };
    const query = jest.fn().mockResolvedValue([[], 1]);
    const transaction = jest.fn(async (_options, run) => run(savepoint));
    const con = { query, transaction } as unknown as Sequelize;
    await expect(
        admin.InsertRows(con, 'people', ['name'], [['Alice']], false, parent)
    ).resolves.toEqual([1, null]);
    expect(transaction).toHaveBeenCalledWith(
        { transaction: parent },
        expect.any(Function)
    );
    expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ transaction: savepoint })
    );
});

it('keeps real database errors separate from a successful insert count', async () => {
    const error = new Error('permission denied');
    const con = {
        query: jest.fn().mockRejectedValue(error),
    } as unknown as Sequelize;
    await expect(
        admin.InsertRows(con, 'people', ['name'], [['Alice']])
    ).resolves.toEqual([0, error]);
});
