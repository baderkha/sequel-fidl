import '@testing-library/jest-dom';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ColSchema } from '../renderer/api';
import { Content } from '../renderer/Pages/DB/content/Content';
import { DataGrid } from '../renderer/Components/DataGrid/DataGrid';

// JSDOM has no layout; render the rows that the virtualizer would expose.
jest.mock('@tanstack/react-virtual', () => ({
    ...jest.requireActual('@tanstack/react-virtual'),
    useVirtualizer: ({ count }: { count: number }) => ({
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 26 })),
        getTotalSize: () => count * 26,
        scrollToIndex: jest.fn(),
    }),
}));
jest.mock('../renderer/api', () => ({
    api: { selectRows: jest.fn(), countRows: jest.fn(), updateRows: jest.fn() },
}));
jest.mock('../renderer/State', () => ({ ConID: 'connection', TxStateAtom: 'transaction' }));
jest.mock('jotai', () => ({
    useAtom: (atom: string) => [atom === 'connection' ? 'connection-1' : { open: false }],
}));
jest.mock('../renderer/Components/SqlEditor/SqlEditor', () => ({
    SqlEditor: ({ value }: { value: string }) => <pre data-testid="sql-preview">{value}</pre>,
}));

const records: { id: number; name: string; notes: string | null }[] = [
    { id: 7, name: 'Alice', notes: null },
    { id: 8, name: 'Bob', notes: null },
];
const schema: ColSchema[] = ['id', 'name', 'notes'].map((name) => ({
    FieldName: name,
    Type: name === 'id' ? 'int' : 'text',
    JsFriendlyType: name === 'id' ? 'number' : 'string',
    IsPrimaryKey: name === 'id',
    NullAllowed: name === 'notes',
    Default: null,
}));
const cell = (text: string) => screen.getByText(text, { selector: '.grid-cell > span' }).closest('.grid-cell') as HTMLElement;
const editor = () => screen.getByRole('textbox', { name: /Edit .*, row/ }) as HTMLTextAreaElement;
const comparison = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
const getSchema = jest.fn().mockResolvedValue(schema);

async function openTable(props = {}) {
    const view = render(<Content TableName="people" refreshStamp={0} getSchema={getSchema} {...props} />);
    // Finish loading effects before interacting with the editable grid.
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(cell('Alice')).toBeInTheDocument());
    return view;
}

function changeName(value = 'Alicia') {
    fireEvent.doubleClick(cell('Alice'));
    fireEvent.change(editor(), { target: { value } });
    fireEvent.blur(editor());
}

beforeEach(() => {
    jest.clearAllMocks();
    getSchema.mockResolvedValue(schema);
    (api.selectRows as jest.Mock).mockResolvedValue([records, null]);
    (api.countRows as jest.Mock).mockResolvedValue([records.length, null]);
    (api.updateRows as jest.Mock).mockResolvedValue([1, null]);
});

it('opens a selected row cell as selectable text and leaves native copy shortcuts alone', async () => {
    await openTable();
    const name = cell('Alice');
    fireEvent.mouseDown(name.closest('.grid-row')!.querySelector('.grid-gutter')!);
    fireEvent.mouseDown(name);
    fireEvent.doubleClick(name);
    const input = editor();
    expect(input).toHaveFocus();
    expect(input.value.substring(input.selectionStart, input.selectionEnd)).toBe('Alice');
    input.setSelectionRange(1, 4);
    const copy = createEvent.keyDown(input, { key: 'c', ctrlKey: true });
    fireEvent(input, copy);
    expect(copy.defaultPrevented).toBe(false);
    expect(input.value.substring(input.selectionStart, input.selectionEnd)).toBe('lic');
});

it('closes an unchanged cell without confirmation or a database write', async () => {
    await openTable();
    fireEvent.doubleClick(cell('Alice'));
    fireEvent.blur(editor());
    expect(screen.queryByRole('textbox', { name: /Edit name/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('does not prompt when a draft is changed back to its original value', async () => {
    await openTable();
    fireEvent.doubleClick(cell('Alice'));
    fireEvent.change(editor(), { target: { value: 'Other' } });
    fireEvent.change(editor(), { target: { value: 'Alice' } });
    fireEvent.blur(editor());
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('shows before, after and SQL on blur, then updates only that row on confirmation', async () => {
    await openTable();
    changeName();
    expect(within(comparison('Before')).getByText('Alice')).toBeInTheDocument();
    expect(within(comparison('After')).getByText('Alicia')).toBeInTheDocument();
    expect(screen.getByTestId('sql-preview')).toHaveTextContent("SET `name` = 'Alicia'");
    expect(api.updateRows).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update row' }));
    await waitFor(() => expect(api.updateRows).toHaveBeenCalledWith(
        'connection-1', 'people', [{ column: 'name', mode: 'value', value: 'Alicia' }], [{ id: 7 }], false
    ));
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument());
    expect(api.selectRows).toHaveBeenCalledTimes(2);
});

it('cancels a proposed change without changing the displayed record', async () => {
    await openTable();
    changeName();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(cell('Alice')).toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('discards a draft with Escape and keeps editing keystrokes away from row shortcuts', async () => {
    await openTable();
    fireEvent.doubleClick(cell('Alice'));
    fireEvent.change(editor(), { target: { value: 'Discard me' } });
    const backspace = createEvent.keyDown(editor(), { key: 'Backspace' });
    fireEvent(editor(), backspace);
    expect(backspace.defaultPrevented).toBe(false);
    expect(screen.queryByText(/Delete .* from people/)).not.toBeInTheDocument();
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(cell('Alice')).toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('reviews on Enter without saving and allows Shift+Enter inside the editor', async () => {
    await openTable();
    fireEvent.doubleClick(cell('Alice'));
    const newline = createEvent.keyDown(editor(), { key: 'Enter', shiftKey: true });
    fireEvent(editor(), newline);
    expect(newline.defaultPrevented).toBe(false);
    fireEvent.change(editor(), { target: { value: 'Alicia' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(screen.getAllByText('Before', { selector: 'dt' })).toHaveLength(1);
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('preserves unchanged NULL and numeric values', async () => {
    await openTable();
    fireEvent.doubleClick(screen.getAllByText('NULL', { selector: '.grid-cell > span' })[0]);
    expect(editor()).toHaveValue('');
    expect(editor()).toHaveAttribute('placeholder', 'NULL');
    fireEvent.blur(editor());
    fireEvent.doubleClick(cell('7'));
    fireEvent.blur(editor());
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('distinguishes an empty string in the confirmation', async () => {
    await openTable();
    changeName('');
    expect(within(comparison('After')).getByText('(empty string)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update row' }));
    await waitFor(() => expect(api.updateRows).toHaveBeenCalledWith(
        'connection-1', 'people', [{ column: 'name', mode: 'value', value: '' }], [{ id: 7 }], false
    ));
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument());
});

it('matches the original key when editing a primary key', async () => {
    await openTable();
    fireEvent.doubleClick(cell('7'));
    fireEvent.change(editor(), { target: { value: '9' } });
    fireEvent.blur(editor());
    fireEvent.click(screen.getByRole('button', { name: 'Update row' }));
    await waitFor(() => expect(api.updateRows).toHaveBeenCalledWith(
        'connection-1', 'people', [{ column: 'id', mode: 'value', value: '9' }], [{ id: 7 }], false
    ));
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument());
});

it('matches all original values with LIMIT 1 for a table without a key', async () => {
    getSchema.mockResolvedValue(schema.map((col) => ({ ...col, IsPrimaryKey: false })));
    await openTable();
    changeName();
    expect(screen.getByTestId('sql-preview')).toHaveTextContent('LIMIT 1');
    fireEvent.click(screen.getByRole('button', { name: 'Update row' }));
    await waitFor(() => expect(api.updateRows).toHaveBeenCalledWith(
        'connection-1', 'people', [{ column: 'name', mode: 'value', value: 'Alicia' }], [records[0]], true
    ));
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument());
});

it('keeps a failed update visible for review or cancellation', async () => {
    (api.updateRows as jest.Mock).mockResolvedValue([0, { message: 'Permission denied' }]);
    await openTable();
    changeName();
    fireEvent.click(screen.getByRole('button', { name: 'Update row' }));
    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(within(comparison('Before')).getByText('Alice')).toBeInTheDocument();
    expect(within(comparison('After')).getByText('Alicia')).toBeInTheDocument();
});

it('uses the value viewer for views and generated columns', async () => {
    const view = await openTable({ isView: true });
    fireEvent.doubleClick(cell('Alice'));
    expect(screen.queryByRole('textbox', { name: /Edit name/ })).not.toBeInTheDocument();
    expect(screen.getByText('Alice', { selector: '.value-viewer' })).toBeInTheDocument();
    view.unmount();
    getSchema.mockResolvedValue(schema.map((col) => ({ ...col, Extra: 'VIRTUAL GENERATED' })));
    await openTable();
    fireEvent.doubleClick(cell('Alice'));
    expect(screen.queryByRole('textbox', { name: /Edit name/ })).not.toBeInTheDocument();
    expect(screen.getByText('Alice', { selector: '.value-viewer' })).toBeInTheDocument();
});

it('clears the confirmation when switching tables', async () => {
    const view = await openTable();
    changeName();
    view.rerender(<Content TableName="other_people" refreshStamp={0} getSchema={getSchema} />);
    await waitFor(() => expect(screen.queryByText('Before')).not.toBeInTheDocument());
    expect(api.updateRows).not.toHaveBeenCalled();
});

it('preserves multiline text when merely opening and leaving it', () => {
    const onCellEdit = jest.fn();
    render(<DataGrid columns={[{ key: 'notes' }]} rows={[{ notes: 'First\r\nSecond' }]} onCellEdit={onCellEdit} />);
    fireEvent.doubleClick(cell('First ↵ Second'));
    expect(editor()).toHaveValue('First\nSecond');
    fireEvent.blur(editor());
    expect(onCellEdit).not.toHaveBeenCalled();
});

it('keeps binary values in the viewer', () => {
    const onCellEdit = jest.fn();
    render(<DataGrid columns={[{ key: 'data' }]} rows={[{ data: new Uint8Array([255]) }]} onCellEdit={onCellEdit} />);
    fireEvent.doubleClick(cell('0xFF'));
    expect(screen.queryByRole('textbox', { name: /Edit data/ })).not.toBeInTheDocument();
    expect(screen.getByText('0xFF', { selector: '.value-viewer' })).toBeInTheDocument();
    expect(onCellEdit).not.toHaveBeenCalled();
});
