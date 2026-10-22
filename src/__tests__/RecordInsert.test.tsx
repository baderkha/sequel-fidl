import '@testing-library/jest-dom';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { api, ColSchema } from '../renderer/api';
import { Content } from '../renderer/Pages/DB/content/Content';
import { DialectContext } from '../renderer/database/DialectContext';
import {
    newRecordDraft,
    recordInsert,
} from '../renderer/Pages/DB/content/recordDraft';

jest.mock('@tanstack/react-virtual', () => ({
    ...jest.requireActual('@tanstack/react-virtual'),
    useVirtualizer: ({ count }: { count: number }) => ({
        getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
                index,
                start: index * 26,
            })),
        getTotalSize: () => count * 26,
        scrollToIndex: jest.fn(),
    }),
}));
jest.mock('../renderer/api', () => ({
    api: {
        selectRows: jest.fn(),
        countRows: jest.fn(),
        insertRows: jest.fn(),
        updateRows: jest.fn(),
    },
}));
jest.mock('../renderer/State', () => ({
    ConID: 'connection',
    TxStateAtom: 'transaction',
}));
jest.mock('jotai', () => ({
    useAtom: (atom: string) => [
        atom === 'connection' ? 'connection-1' : { open: false },
    ],
}));
jest.mock('../renderer/Components/SqlEditor/SqlEditor', () => ({
    SqlEditor: ({ value }: { value: string }) => (
        <pre data-testid="sql-preview">{value}</pre>
    ),
}));

const column = (name: string, patch: Partial<ColSchema> = {}): ColSchema => ({
    FieldName: name,
    Type: 'text',
    JsFriendlyType: 'string',
    NullAllowed: false,
    IsPrimaryKey: false,
    Default: null,
    ...patch,
});
const schema = [
    column('id', { Type: 'integer', IsPrimaryKey: true, AutoIncrement: true }),
    column('name'),
    column('notes', { NullAllowed: true }),
    column('active', { Type: 'boolean', Default: true }),
    column('computed', { Extra: 'STORED GENERATED' }),
];
const getSchema = jest.fn().mockResolvedValue(schema);
const rows = [
    {
        id: 7,
        name: 'Alice',
        notes: null as string | null,
        active: true,
        computed: 'ALICE',
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    getSchema.mockResolvedValue(schema);
    (api.selectRows as jest.Mock).mockResolvedValue([rows, null]);
    (api.countRows as jest.Mock).mockResolvedValue([rows.length, null]);
    (api.insertRows as jest.Mock).mockResolvedValue([1, null]);
});

async function openTable(props = {}, postgres = false) {
    const view = render(
        <DialectContext.Provider value={postgres ? 'postgres' : 'mysql'}>
            <Content
                TableName="people"
                refreshStamp={0}
                getSchema={getSchema}
                {...props}
            />
        </DialectContext.Provider>
    );
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Insert Record' })
        ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert Record' }));
    return view;
}
const input = (name: string) =>
    screen.getByRole('textbox', { name: `New ${name}` });
const review = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Review insert…' }));

it('starts a draft before existing rows and focuses the first writable field, skipping generated columns', async () => {
    await openTable();
    const draft = screen.getByRole('group', { name: 'New record' });
    expect(input('name')).toHaveFocus();
    expect(within(draft).getByText('Auto')).toBeInTheDocument();
    expect(within(draft).getByText('Generated')).toBeInTheDocument();
    expect(
        screen.queryByRole('textbox', { name: 'New id' })
    ).not.toBeInTheDocument();
    const alice = screen.getByText('Alice', { selector: '.grid-cell > span' });
    expect(
        draft.compareDocumentPosition(alice) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.change(input('name'), { target: { value: 'Bob' } });
    fireEvent.blur(input('name'));
    expect(api.insertRows).not.toHaveBeenCalled();
    expect(api.updateRows).not.toHaveBeenCalled();
    expect(alice).toHaveTextContent('Alice');
});

it('reviews an INSERT and writes only after confirmation, omitting IDs, generated columns and defaults', async () => {
    await openTable();
    fireEvent.change(input('name'), { target: { value: 'Bob' } });
    review();
    expect(screen.getByTestId('sql-preview')).toHaveTextContent(
        "INSERT INTO `people` (`name`) VALUES ('Bob')"
    );
    expect(api.insertRows).not.toHaveBeenCalled();
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Insert record' }));
    });
    await waitFor(() =>
        expect(api.insertRows).toHaveBeenCalledWith(
            'connection-1',
            'people',
            ['name'],
            [['Bob']],
            false
        )
    );
    await waitFor(() =>
        expect(
            screen.queryByRole('group', { name: 'New record' })
        ).not.toBeInTheDocument()
    );
    expect(api.selectRows).toHaveBeenCalledTimes(2);
    expect(api.countRows).toHaveBeenCalledTimes(2);
});

it.each([0, null, undefined])(
    'refreshes after an error-free insert with count %s instead of prompting a duplicate retry',
    async (count) => {
        (api.insertRows as jest.Mock).mockResolvedValue([count, null]);
        (api.selectRows as jest.Mock)
            .mockResolvedValueOnce([rows, null])
            .mockResolvedValue([
                [...rows, { ...rows[0], id: 8, name: 'Bob' }],
                null,
            ]);
        await openTable();
        fireEvent.change(input('name'), { target: { value: 'Bob' } });
        review();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Insert record' })
            );
        });
        expect(
            await screen.findByText('Bob', { selector: '.grid-cell > span' })
        ).toBeInTheDocument();
        expect(
            screen.queryByText(
                'No record was inserted. Review the values and try again.'
            )
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Insert record', exact: true })
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'New record' })
        ).not.toBeInTheDocument();
        expect(api.insertRows).toHaveBeenCalledTimes(1);
        expect(api.selectRows).toHaveBeenCalledTimes(2);
    }
);

it('works for empty tables, requires missing values, and distinguishes empty text from NULL', async () => {
    (api.selectRows as jest.Mock).mockResolvedValue([[], null]);
    (api.countRows as jest.Mock).mockResolvedValue([0, null]);
    await openTable();
    expect(input('name')).toHaveFocus();
    review();
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a value for "name"'
    );
    fireEvent.change(screen.getByLabelText('Value mode for name'), {
        target: { value: 'value' },
    });
    fireEvent.change(screen.getByLabelText('Value mode for notes'), {
        target: { value: 'null' },
    });
    review();
    expect(screen.getByTestId('sql-preview')).toHaveTextContent(
        "VALUES ('', NULL)"
    );
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Insert record' }));
    });
    await waitFor(() =>
        expect(api.insertRows).toHaveBeenCalledWith(
            'connection-1',
            'people',
            ['name', 'notes'],
            [['', null]],
            false
        )
    );
});

it('retains the draft when review is cancelled and when an insert fails', async () => {
    (api.insertRows as jest.Mock).mockResolvedValue([
        0,
        { message: 'Duplicate key' },
    ]);
    await openTable();
    fireEvent.change(input('name'), { target: { value: 'Bob' } });
    review();
    fireEvent.click(
        screen.getByRole('button', { name: 'Cancel', exact: true })
    );
    expect(input('name')).toHaveValue('Bob');
    expect(input('name')).toHaveFocus();
    review();
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Insert record' }));
    });
    expect(await screen.findByText('Duplicate key')).toBeInTheDocument();
    fireEvent.click(
        screen.getByRole('button', { name: 'Cancel', exact: true })
    );
    expect(input('name')).toHaveValue('Bob');
    expect(api.selectRows).toHaveBeenCalledTimes(1);
});

it('cancels with Escape and keeps draft keyboard shortcuts away from existing rows', async () => {
    await openTable();
    fireEvent.change(input('name'), { target: { value: 'Discard' } });
    fireEvent.keyDown(input('name'), { key: 'Backspace' });
    expect(screen.queryByText(/Delete .* from people/)).not.toBeInTheDocument();
    fireEvent.keyDown(input('name'), { key: 'Escape' });
    expect(
        screen.queryByRole('group', { name: 'New record' })
    ).not.toBeInTheDocument();
    expect(api.insertRows).not.toHaveBeenCalled();
});

it('moves across draft cells on Enter and reviews with Command+Enter', async () => {
    await openTable();
    fireEvent.change(input('name'), { target: { value: 'Bob' } });
    fireEvent.keyDown(input('name'), { key: 'Enter' });
    expect(input('notes')).toHaveFocus();
    fireEvent.keyDown(input('notes'), { key: 'Enter', metaKey: true });
    expect(screen.getByTestId('sql-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert record' })).toHaveFocus();
    expect(api.insertRows).not.toHaveBeenCalled();
});

it.each(['mysql', 'postgres'] as const)(
    'supports a %s record containing only a generated identity',
    async (dialect) => {
        getSchema.mockResolvedValue([schema[0]]);
        await openTable({}, dialect === 'postgres');
        review();
        expect(screen.getByTestId('sql-preview')).toHaveTextContent(
            dialect === 'postgres'
                ? 'INSERT INTO "people" DEFAULT VALUES;'
                : 'INSERT INTO `people` () VALUES ();'
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Insert record' })
            );
        });
        await waitFor(() =>
            expect(api.insertRows).toHaveBeenCalledWith(
                'connection-1',
                'people',
                [],
                [[]],
                false
            )
        );
    }
);

it('opens a table draft from JSON view and clears it when changing tables', async () => {
    localStorage.setItem('sequel-fidl.content-view', 'json');
    const view = await openTable();
    expect(
        screen.getByRole('button', { name: 'Table', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(input('name'), { target: { value: 'Bob' } });
    review();
    view.rerender(
        <Content
            TableName="other_people"
            refreshStamp={0}
            getSchema={getSchema}
        />
    );
    await waitFor(() =>
        expect(
            screen.queryByRole('group', { name: 'New record' })
        ).not.toBeInTheDocument()
    );
    expect(
        screen.queryByText('Insert record into people?')
    ).not.toBeInTheDocument();
    expect(api.insertRows).not.toHaveBeenCalled();
});

it('keeps views read only', async () => {
    render(
        <Content
            TableName="people"
            refreshStamp={0}
            getSchema={getSchema}
            isView
        />
    );
    await act(async () => {
        await Promise.resolve();
    });
    expect(
        screen.queryByRole('button', { name: 'Insert Record' })
    ).not.toBeInTheDocument();
});

it('validates structured fields and preserves exact numbers, JSON text and native PostgreSQL arrays', () => {
    const fields = [
        column('profile', { Type: 'jsonb' }),
        column('tags', { Type: 'text[]' }),
        column('enabled', { Type: 'boolean' }),
        column('amount', { Type: 'numeric' }),
    ];
    const draft = newRecordDraft(fields);
    draft.profile = {
        ...draft.profile,
        mode: 'value',
        value: '{"large":9007199254740993}',
    };
    draft.tags = { ...draft.tags, mode: 'value', value: '["one","two"]' };
    draft.enabled = { ...draft.enabled, mode: 'value', value: 'true' };
    draft.amount = {
        ...draft.amount,
        mode: 'value',
        value: '12345678901234567890.123456',
    };
    expect(recordInsert(fields, draft)).toEqual({
        columns: ['profile', 'tags', 'enabled', 'amount'],
        values: [
            '{"large":9007199254740993}',
            ['one', 'two'],
            true,
            '12345678901234567890.123456',
        ],
    });
    expect(() =>
        recordInsert(fields, {
            ...draft,
            profile: { ...draft.profile, value: '{' },
        })
    ).toThrow('valid JSON');
    expect(() =>
        recordInsert(fields, { ...draft, tags: { ...draft.tags, value: '{}' } })
    ).toThrow('JSON array');
    expect(() =>
        recordInsert(fields, {
            ...draft,
            enabled: { ...draft.enabled, value: 'yes' },
        })
    ).toThrow('true or false');
});
