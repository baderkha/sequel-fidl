import React from 'react';
import { useDatabaseDialect } from 'renderer/database/DialectContext';
import { useTheme } from 'renderer/theme/ThemeProvider';
import {
    applyMonacoTheme,
    CompletionSource,
    monaco,
    registerSqlFeatures,
    setCompletionSource,
} from './monacoSetup';
import { splitStatements, statementAt } from './statements';

export type SqlEditorHandle = {
    /** run Format Document (shift+alt+f) */
    format: () => void;
    /** the selection , or the statement under the cursor */
    currentStatement: () => string | null;
    /** every statement in the editor */
    allStatements: () => string[];
    focus: () => void;
};

export type SqlEditorProps = {
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    /** cmd+enter */
    onRun?: () => void;
    /** cmd+shift+enter */
    onRunAll?: () => void;
    completion?: CompletionSource;
};

const FLASH_MS = 700;

/**
 * Monaco (the VS Code editor) for sql
 */
export const SqlEditor = React.forwardRef<SqlEditorHandle, SqlEditorProps>(
    function SqlEditor(p, ref) {
        const dialect = useDatabaseDialect();
        const hostRef = React.useRef<HTMLDivElement>(null);
        const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor>(null);
        const { theme } = useTheme();
        // keep the latest callbacks for the commands registered once on mount
        const props = React.useRef(p);
        props.current = p;

        React.useEffect(() => {
            registerSqlFeatures(dialect);
            applyMonacoTheme(theme);
            const editor = monaco.editor.create(hostRef.current, {
                value: p.value,
                language: dialect === 'postgres' ? 'pgsql' : 'mysql',
                readOnly: p.readOnly,
                automaticLayout: true,
                fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Monaco, monospace",
                fontSize: 13,
                lineHeight: 20,
                tabSize: 2,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: p.readOnly ? 'none' : 'line',
                padding: { top: 12, bottom: 12 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                fixedOverflowWidgets: true,
                wordBasedSuggestions: 'off',
                // polite suggestions : appear after a short pause while typing a word , never in strings / comments
                quickSuggestions: { other: true, comments: false, strings: false },
                quickSuggestionsDelay: 200,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnCommitCharacter: false,
                suggest: {
                    showWords: false,
                    showSnippets: false,
                    localityBonus: true,
                    preview: false,
                    showStatusBar: true,
                },
                lineNumbersMinChars: 3,
                glyphMargin: false,
                folding: !p.readOnly,
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                    useShadows: false,
                },
                domReadOnly: p.readOnly,
                contextmenu: true,
            });
            editorRef.current = editor;

            const sub = editor.onDidChangeModelContent(() => {
                props.current.onChange &&
                    props.current.onChange(editor.getValue());
            });
            // ⌃Space / ⌥Esc are monaco's defaults , ⌘I as in VS Code (macOS often takes ⌃Space for input sources)
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () =>
                editor.trigger('keyboard', 'editor.action.triggerSuggest', {})
            );
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
                props.current.onRun && props.current.onRun()
            );
            editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                () => props.current.onRunAll && props.current.onRunAll()
            );
            return () => {
                sub.dispose();
                editor.dispose();
            };
        }, []);

        React.useEffect(() => {
            applyMonacoTheme(theme);
        }, [theme]);

        React.useEffect(() => {
            if (p.completion) {
                setCompletionSource(p.completion);
            }
        }, [p.completion]);

        React.useEffect(() => {
            registerSqlFeatures(dialect);
            const model = editorRef.current?.getModel();
            if (model) monaco.editor.setModelLanguage(model,dialect === 'postgres' ? 'pgsql' : 'mysql');
        },[dialect]);

        // external value changes (read only views , table switches)
        React.useEffect(() => {
            const editor = editorRef.current;
            if (editor && editor.getValue() !== p.value) {
                editor.setValue(p.value);
            }
        }, [p.value]);

        const flash = (start: number, end: number) => {
            const editor = editorRef.current;
            const model = editor.getModel();
            const from = model.getPositionAt(start);
            const to = model.getPositionAt(end);
            const ids = editor.deltaDecorations(
                [],
                [
                    {
                        range: new monaco.Range(
                            from.lineNumber,
                            from.column,
                            to.lineNumber,
                            to.column
                        ),
                        options: { className: 'executed-stmt' },
                    },
                ]
            );
            window.setTimeout(() => editor.deltaDecorations(ids, []), FLASH_MS);
        };

        React.useImperativeHandle(ref, () => ({
            format: () =>
                editorRef.current?.getAction('editor.action.formatDocument')?.run(),
            focus: () => editorRef.current?.focus(),
            currentStatement: () => {
                const editor = editorRef.current;
                const model = editor.getModel();
                const sel = editor.getSelection();
                if (sel && !sel.isEmpty()) {
                    const text = model.getValueInRange(sel).trim();
                    if (text) {
                        flash(
                            model.getOffsetAt(sel.getStartPosition()),
                            model.getOffsetAt(sel.getEndPosition())
                        );
                        return text;
                    }
                }
                const stmt = statementAt(
                    model.getValue(),
                    model.getOffsetAt(editor.getPosition()),
                    dialect
                );
                if (!stmt) {
                    return null;
                }
                flash(stmt.start, stmt.end);
                return stmt.text;
            },
            allStatements: () => {
                const text = editorRef.current.getValue();
                const stmts = splitStatements(text,dialect);
                if (stmts.length) {
                    flash(stmts[0].start, stmts[stmts.length - 1].end);
                }
                return stmts.map((s) => s.text);
            },
        }));

        return <div className="editor-host" ref={hostRef} />;
    }
);
