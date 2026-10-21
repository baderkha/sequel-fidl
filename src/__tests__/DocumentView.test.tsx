import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ColSchema } from '../renderer/api';
import { Content } from '../renderer/Pages/DB/content/Content';
import { parseDocumentJSON, recordAssignments, toRecordDocument } from '../renderer/Pages/DB/content/documentValues';

jest.mock('@tanstack/react-virtual', () => ({
    ...jest.requireActual('@tanstack/react-virtual'),
    useVirtualizer: ({ count }: { count: number }) => ({
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 200 })),
        getTotalSize: () => count * 200,
        scrollToIndex: jest.fn(),
        measureElement: jest.fn(),
    }),
}));
jest.mock('../renderer/api', () => ({
    api: { selectRows: jest.fn(), countRows: jest.fn(), updateRows: jest.fn(), deleteRows: jest.fn() },
}));
jest.mock('../renderer/State', () => ({ ConID: 'connection', TxStateAtom: 'transaction' }));
jest.mock('jotai', () => ({
    useAtom: (atom: string) => [atom === 'connection' ? 'connection-1' : { open: false }],
}));
jest.mock('../renderer/Components/SqlEditor/SqlEditor', () => ({
    SqlEditor: ({ value }: { value: string }) => <pre data-testid="sql-preview">{value}</pre>,
}));

const profile = { address: { city: 'Paris' }, roles: ['reader', { enabled: true }], active: true };
const records = [
    { id: '9007199254740993', name: 'Alice', profile, notes: null as string | null, balance: '12345678901234567890.12345', computed: 'ALICE', data: new Uint8Array([0, 255]) },
    { id: '9007199254740994', name: 'Bob', profile: {}, notes: null as string | null, balance: '0.00', computed: 'BOB', data: new Uint8Array() },
];
const schema: ColSchema[] = [
    ['id', 'bigint unsigned'], ['name', 'varchar(255)'], ['profile', 'json'],
    ['notes', 'text'], ['balance', 'decimal(30,5)'], ['computed', 'varchar(255)'], ['data', 'blob'],
].map(([name, type]) => ({
    FieldName: name, Type: type, JsFriendlyType: 'string', IsPrimaryKey: name === 'id',
    NullAllowed: name === 'notes', Default: null,
    Extra: name === 'computed' ? 'STORED GENERATED' : '',
}));
const getSchema = jest.fn().mockResolvedValue(schema);
const card = () => screen.getByRole('article', { name: 'Record 1' });
const input = () => screen.getByRole('textbox', { name: 'Record JSON' }) as HTMLTextAreaElement;

async function openContent(props = {}) {
    const view = render(<Content TableName="people" refreshStamp={0} getSchema={getSchema} {...props} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(within(screen.getByRole('group', { name: 'Content view' })).getByRole('button', { name: 'JSON' }));
    await screen.findByRole('article', { name: 'Record 1' });
    return view;
}

function editRecord() {
    fireEvent.click(within(card()).getByRole('button', { name: 'Edit' }));
    return JSON.parse(input().value);
}

function changeRecord(change: (document: Record<string, any>) => void) {
    const document = editRecord();
    change(document);
    fireEvent.change(input(), { target: { value: JSON.stringify(document, null, 2) } });
}

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    getSchema.mockResolvedValue(schema);
    (api.selectRows as jest.Mock).mockResolvedValue([records, null]);
    (api.countRows as jest.Mock).mockResolvedValue([2, null]);
    (api.updateRows as jest.Mock).mockResolvedValue([1, null]);
    (api.deleteRows as jest.Mock).mockResolvedValue([1, null]);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue(undefined) } });
});

it('switches between table and JSON cards and remembers the chosen view', async () => {
    const view = await openContent();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(localStorage.getItem('sequel-fidl.content-view')).toBe('json');
    expect(api.selectRows).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<Content TableName="people" refreshStamp={0} getSchema={getSchema} />);
    await act(async () => { await Promise.resolve(); });
    expect(card()).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Content view' })).getByRole('button', { name: 'Table' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('Alice', { selector: '.grid-cell > span' })).toBeInTheDocument();
});

it('starts nested objects and arrays collapsed, expands one level at a time, and collapses them again', async () => {
    await openContent();
    const record = within(card());
    const profileToggle = record.getByRole('button', { name: 'Expand $["profile"]' });
    expect(profileToggle).toHaveAttribute('aria-expanded', 'false');
    expect(record.queryByText('"city"')).not.toBeInTheDocument();
    fireEvent.click(profileToggle);
    expect(record.getByRole('button', { name: 'Expand $["profile"]["address"]' })).toBeInTheDocument();
    expect(record.queryByText('"Paris"')).not.toBeInTheDocument();
    fireEvent.click(record.getByRole('button', { name: 'Expand $["profile"]["address"]' }));
    expect(record.getByText('"Paris"')).toBeInTheDocument();
    fireEvent.click(record.getByRole('button', { name: 'Expand $["profile"]["roles"]' }));
    expect(record.getByText('"reader"')).toBeInTheDocument();
    expect(record.getByRole('button', { name: 'Expand $["profile"]["roles"][1]' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse nested' }));
    expect(within(card()).getByRole('button', { name: 'Expand $["profile"]' })).toHaveAttribute('aria-expanded', 'false');
});

it('provides SQL metadata on fields and JSON types and paths on nested values', async () => {
    await openContent();
    const record = within(card());
    expect(record.getByText('"id"').closest('.json-field')).toHaveAttribute('title', expect.stringContaining('SQL type: bigint unsigned'));
    expect(record.getByText('"id"').closest('.json-field')).toHaveAttribute('title', expect.stringContaining('Primary key'));
    expect(record.getByText('"notes"').closest('.json-field')).toHaveAttribute('title', expect.stringContaining('SQL NULL'));
    expect(record.getByText('"data"').closest('.json-field')).toHaveAttribute('title', expect.stringContaining('binary · 2 bytes'));
    fireEvent.click(record.getByRole('button', { name: 'Expand $["profile"]' }));
    const active = record.getByText('"active"').closest('.json-field');
    expect(active).toHaveAttribute('title', expect.stringContaining('Type: boolean'));
    expect(active).toHaveAttribute('title', expect.stringContaining('$["profile"]["active"]'));
});

it('copies a real JSON document with nested values and precise numeric strings', async () => {
    await openContent();
    fireEvent.click(within(card()).getByRole('button', { name: 'Copy record 1 as JSON' }));
    const copied = JSON.parse((navigator.clipboard.writeText as jest.Mock).mock.calls[0][0]);
    expect(copied.profile).toEqual(profile);
    expect(copied.id).toBe('9007199254740993');
    expect(copied.balance).toBe('12345678901234567890.12345');
    expect(copied.data).toEqual({ $binary: '00ff' });
});

it('closes unchanged JSON without an update, including reordered object keys', async () => {
    await openContent();
    const document = editRecord();
    document.profile = { active: true, roles: profile.roles, address: profile.address };
    fireEvent.change(input(), { target: { value: JSON.stringify(document) } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('textbox', { name: 'Record JSON' })).not.toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('reviews before/after and SQL, then updates only changed fields using the original key', async () => {
    await openContent();
    changeRecord((document) => {
        document.id = '9007199254741000';
        document.name = 'Alicia';
        document.profile.address.city = 'London';
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
    expect(screen.getByTestId('sql-preview')).toHaveTextContent('9007199254740993');
    expect(api.updateRows).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(JSON.parse(input().value).profile.address.city).toBe('London');
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update record' })); });
    await waitFor(() => expect(api.updateRows).toHaveBeenCalledWith(
        'connection-1', 'people', [
            { column: 'id', mode: 'value', value: '9007199254741000' },
            { column: 'name', mode: 'value', value: 'Alicia' },
            { column: 'profile', mode: 'value', value: JSON.stringify({ ...profile, address: { city: 'London' } }) },
        ], [{ id: '9007199254740993' }], false
    ));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Update record' })).not.toBeInTheDocument());
});

it('cancels edits without writing to the database', async () => {
    await openContent();
    changeRecord((document) => { document.name = 'Discard this'; });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.updateRows).not.toHaveBeenCalled();
    expect(within(card()).getByText('"Alice"')).toBeInTheDocument();
});

it('keeps failed record updates visible', async () => {
    (api.updateRows as jest.Mock).mockResolvedValue([0, { message: 'Duplicate key' }]);
    await openContent();
    changeRecord((document) => { document.name = 'Alicia'; });
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update record' })); });
    expect(await screen.findByText('Duplicate key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update record' })).toBeEnabled();
});

it('confirms deletion of only the selected card', async () => {
    await openContent();
    fireEvent.click(within(card()).getByRole('button', { name: 'Delete record 1' }));
    expect(screen.getByTestId('sql-preview')).toHaveTextContent('9007199254740993');
    expect(api.deleteRows).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteRows).not.toHaveBeenCalled();
    fireEvent.click(within(card()).getByRole('button', { name: 'Delete record 1' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    await waitFor(() => expect(api.deleteRows).toHaveBeenCalledWith('connection-1', 'people', [{ id: '9007199254740993' }], false));
    await waitFor(() => expect(screen.queryByTestId('sql-preview')).not.toBeInTheDocument());
});

it('keeps database views read only', async () => {
    await openContent({ isView: true });
    expect(within(card()).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card()).queryByRole('button', { name: 'Delete record 1' })).not.toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: 'Copy record 1 as JSON' })).toBeInTheDocument();
});

it('retains server sorting in JSON view', async () => {
    await openContent();
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort JSON records by' }), { target: { value: 'name' } });
    await waitFor(() => expect(api.selectRows).toHaveBeenLastCalledWith('connection-1', expect.objectContaining({ orderByCol: 'name', orderDir: 'ASC' })));
    fireEvent.click(screen.getByRole('button', { name: 'Sort descending' }));
    await waitFor(() => expect(api.selectRows).toHaveBeenLastCalledWith('connection-1', expect.objectContaining({ orderByCol: 'name', orderDir: 'DESC' })));
});

it.each([
    ['[]', 'A record must be a JSON object.'],
    ['{', 'JSON'],
])('rejects invalid record JSON %s', async (value, _message) => {
    await openContent();
    editRecord();
    fireEvent.change(input(), { target: { value } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(api.updateRows).not.toHaveBeenCalled();
});

describe('record value preservation', () => {
    it('preserves date, binary, big integers, decimals and NULL when other values change', () => {
        const row = { ...records[0], created: new Date('2026-10-20T12:34:56.123Z'), huge: BigInt('9007199254740999') };
        const document = toRecordDocument(row, schema);
        expect(document.created).toBe('2026-10-20 12:34:56.123');
        expect(document.huge).toBe('9007199254740999');
        document.name = 'Alicia';
        expect(recordAssignments(row, schema, document)).toEqual([{ column: 'name', mode: 'value', value: 'Alicia' }]);
    });

    it('supports setting nullable fields to SQL NULL and preserves JSON scalars', () => {
        const row = { ...records[0], notes: 'clear me' };
        const document = toRecordDocument(row, schema);
        document.notes = null;
        document.profile = 'a JSON string';
        expect(recordAssignments(row, schema, document)).toEqual([
            { column: 'profile', mode: 'value', value: '"a JSON string"' },
            { column: 'notes', mode: 'null' },
        ]);
    });

    it.each([
        ['missing column', (d: any) => { delete d.name; }, 'Keep column "name"'],
        ['unknown column', (d: any) => { d.surprise = 1; }, 'Unknown column'],
        ['generated column', (d: any) => { d.computed = 'changed'; }, 'read only'],
        ['binary column', (d: any) => { d.data.$binary = 'ffff'; }, 'read only'],
        ['NOT NULL column', (d: any) => { d.name = null; }, 'does not allow NULL'],
        ['scalar column with object', (d: any) => { d.name = {}; }, 'expects a scalar'],
    ])('rejects changes to %s', (_label, change, message) => {
        const document = toRecordDocument(records[0], schema);
        change(document);
        expect(() => recordAssignments(records[0], schema, document)).toThrow(message);
    });

    it('does not silently round unsafe JSON integers', () => {
        expect(() => parseDocumentJSON('{"id":9007199254740993}')).toThrow('quoted string');
        const row = { ...records[0], profile: { id: Number('9007199254740993') } };
        const document = toRecordDocument(row, schema);
        document.name = 'Alicia';
        expect(recordAssignments(row, schema, document)).toEqual([{ column: 'name', mode: 'value', value: 'Alicia' }]);
        document.profile = { id: 'different' };
        expect(() => recordAssignments(row, schema, document)).toThrow('read only');
    });

    it.each(['{}', 'true', 'null', 'hello'])('preserves native JSON string scalars: %s', (value) => {
        const row = { ...records[0], profile: value };
        const document = toRecordDocument(row, schema);
        expect(document.profile).toBe(value);
        expect(recordAssignments(row, schema, document)).toEqual([]);
        document.profile = `${value}!`;
        expect(recordAssignments(row, schema, document)).toEqual([{ column: 'profile', mode: 'value', value: JSON.stringify(`${value}!`) }]);
    });
});
