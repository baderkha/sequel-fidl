import React from 'react';
import {
    Code,
    Copy,
    ExternalLink,
    Eye,
    File,
    FileCode2,
    FileSpreadsheet,
    FileText,
    Film,
    FolderSearch,
    Image as ImageIcon,
    Music,
    RotateCcw,
    Table as TableIcon,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { api } from 'renderer/api';
import { useToast } from 'renderer/Components/ui/Toasts';

export type FilePreviewModalProps = {
    open: boolean;
    rel: string | null;
    scope: string;
    absPath: (rel: string) => string;
    onClose: () => void;
    onOpenInEditor?: (rel: string) => void;
    onOpenExternal?: (rel: string) => void;
    onReveal?: (rel: string) => void;
};

type ViewMode = 'formatted' | 'raw';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma']);
const PDF_EXTS = new Set(['pdf']);
const TABULAR_EXTS = new Set(['csv', 'tsv']);
const JSON_EXTS = new Set(['json', 'jsonl', 'geojson']);
const MARKDOWN_EXTS = new Set(['md', 'markdown']);
const CODE_EXTS = new Set([
    'sql', 'txt', 'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass',
    'less', 'xml', 'yaml', 'yml', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'rs', 'go', 'env',
    'ini', 'conf', 'cfg', 'toml', 'psql', 'ddl', 'log', 'graphql', 'proto'
]);

function parseDelimited(text: string, delimiter: string, maxRows = 100): string[][] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const result: string[][] = [];
    for (let i = 0; i < Math.min(lines.length, maxRows); i++) {
        const line = lines[i];
        const row: string[] = [];
        let curr = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (ch === '"' || ch === "'") {
                if (inQuotes && line[j + 1] === ch) {
                    curr += ch;
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === delimiter && !inQuotes) {
                row.push(curr);
                curr = '';
            } else {
                curr += ch;
            }
        }
        row.push(curr);
        result.push(row);
    }
    return result;
}

function renderSimpleMarkdown(md: string) {
    const lines = md.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let inCode = false;
    let codeBuffer: string[] = [];
    let listBuffer: string[] = [];

    const flushList = (key: string) => {
        if (listBuffer.length) {
            elements.push(
                <ul key={key} className="preview-md-list">
                    {listBuffer.map((item, idx) => (
                        <li key={idx}>{item}</li>
                    ))}
                </ul>
            );
            listBuffer = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim().startsWith('```')) {
            flushList(`list-${i}`);
            if (inCode) {
                elements.push(
                    <pre key={`code-${i}`} className="preview-md-code">
                        <code>{codeBuffer.join('\n')}</code>
                    </pre>
                );
                codeBuffer = [];
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }

        if (inCode) {
            codeBuffer.push(line);
            continue;
        }

        if (line.startsWith('# ')) {
            flushList(`list-${i}`);
            elements.push(<h1 key={i} className="preview-md-h1">{line.slice(2)}</h1>);
        } else if (line.startsWith('## ')) {
            flushList(`list-${i}`);
            elements.push(<h2 key={i} className="preview-md-h2">{line.slice(3)}</h2>);
        } else if (line.startsWith('### ')) {
            flushList(`list-${i}`);
            elements.push(<h3 key={i} className="preview-md-h3">{line.slice(4)}</h3>);
        } else if (line.startsWith('#### ')) {
            flushList(`list-${i}`);
            elements.push(<h4 key={i} className="preview-md-h4">{line.slice(5)}</h4>);
        } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            listBuffer.push(line.trim().slice(2));
        } else if (line.trim() === '') {
            flushList(`list-${i}`);
        } else {
            flushList(`list-${i}`);
            elements.push(<p key={i} className="preview-md-p">{line}</p>);
        }
    }

    flushList('list-end');
    if (inCode && codeBuffer.length) {
        elements.push(
            <pre key="code-end" className="preview-md-code">
                <code>{codeBuffer.join('\n')}</code>
            </pre>
        );
    }

    return <div className="preview-md-body">{elements}</div>;
}

export function FilePreviewModal({
    open,
    rel,
    scope,
    absPath,
    onClose,
    onOpenInEditor,
    onOpenExternal,
    onReveal,
}: FilePreviewModalProps) {
    const notify = useToast();
    const [textContent, setTextContent] = React.useState<string | null>(null);
    const [loadingText, setLoadingText] = React.useState(false);
    const [readError, setReadError] = React.useState<string | null>(null);
    const [viewMode, setViewMode] = React.useState<ViewMode>('formatted');
    const [zoom, setZoom] = React.useState(100);
    const [imgDimensions, setImgDimensions] = React.useState<{ width: number; height: number } | null>(null);
    const [forceText, setForceText] = React.useState(false);

    const name = rel ? rel.slice(rel.lastIndexOf('/') + 1) : '';
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
    const absolute = rel ? absPath(rel) : '';
    const fileUrl = absolute
        ? absolute.startsWith('/')
            ? `file://${absolute}`
            : `file:///${absolute.replace(/\\/g, '/')}`
        : '';

    const isImage = IMAGE_EXTS.has(ext);
    const isVideo = VIDEO_EXTS.has(ext);
    const isAudio = AUDIO_EXTS.has(ext);
    const isPdf = PDF_EXTS.has(ext);
    const isTabular = TABULAR_EXTS.has(ext);
    const isJson = JSON_EXTS.has(ext);
    const isMarkdown = MARKDOWN_EXTS.has(ext);
    const isCode = CODE_EXTS.has(ext);
    const isParquet = ext === 'parquet';

    const shouldReadText = forceText || isTabular || isJson || isMarkdown || isCode;

    React.useEffect(() => {
        if (!open || !rel || !shouldReadText) {
            setTextContent(null);
            setLoadingText(false);
            setReadError(null);
            return;
        }

        setLoadingText(true);
        setReadError(null);
        api.readFile(scope, rel)
            .then(([text, err]) => {
                setLoadingText(false);
                if (err) {
                    setReadError(err.message || 'Failed to read file');
                    setTextContent(null);
                } else {
                    setTextContent(text);
                }
            })
            .catch((err) => {
                setLoadingText(false);
                setReadError(err?.message || 'Failed to read file');
            });
    }, [open, rel, scope, shouldReadText]);

    React.useEffect(() => {
        if (!open) {
            setZoom(100);
            setImgDimensions(null);
            setViewMode('formatted');
            setForceText(false);
        }
    }, [open]);

    React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                ev.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);

    if (!open || !rel) return null;

    const copyPath = () => {
        navigator.clipboard.writeText(absolute).then(() => notify('Copied file path', 'success'));
    };

    const copyContent = () => {
        if (textContent !== null) {
            navigator.clipboard.writeText(textContent).then(() => notify('Copied file content', 'success'));
        }
    };

    const getIcon = () => {
        if (isImage) return <ImageIcon size={16} className="preview-type-icon is-image" />;
        if (isVideo) return <Film size={16} className="preview-type-icon is-video" />;
        if (isAudio) return <Music size={16} className="preview-type-icon is-audio" />;
        if (isTabular) return <FileSpreadsheet size={16} className="preview-type-icon is-data" />;
        if (isJson || isCode) return <FileCode2 size={16} className="preview-type-icon is-code" />;
        if (isMarkdown || isPdf) return <FileText size={16} className="preview-type-icon is-doc" />;
        return <File size={16} className="preview-type-icon" />;
    };

    const renderContent = () => {
        if (loadingText) {
            return (
                <div className="preview-loading">
                    <span className="spinner" /> Loading file preview…
                </div>
            );
        }

        if (readError) {
            return (
                <div className="preview-error">
                    <div className="error-box">{readError}</div>
                    <div className="preview-actions-row">
                        {onOpenExternal && (
                            <button
                                type="button"
                                className="btn is-primary"
                                onClick={() => onOpenExternal(rel)}
                            >
                                <ExternalLink size={13} /> Open in Default App
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        // 1. Image preview
        if (isImage && !forceText) {
            return (
                <div className="preview-media-container preview-checkerboard">
                    <img
                        src={fileUrl}
                        alt={name}
                        className="preview-image"
                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}
                        onLoad={(ev) => {
                            const img = ev.currentTarget;
                            setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                        }}
                    />
                </div>
            );
        }

        // 2. Video preview
        if (isVideo && !forceText) {
            return (
                <div className="preview-media-container">
                    <video controls src={fileUrl} className="preview-video">
                        <track kind="captions" />
                        Your browser does not support the video tag.
                    </video>
                </div>
            );
        }

        // 3. Audio preview
        if (isAudio && !forceText) {
            return (
                <div className="preview-media-container preview-audio-box">
                    <Music size={48} className="preview-audio-icon" />
                    <div className="preview-audio-title">{name}</div>
                    <audio controls src={fileUrl} className="preview-audio">
                        <track kind="captions" />
                        Your browser does not support the audio tag.
                    </audio>
                </div>
            );
        }

        // 4. PDF preview
        if (isPdf && !forceText) {
            return (
                <div className="preview-media-container preview-pdf-box">
                    <iframe src={fileUrl} title={name} className="preview-pdf-frame" />
                </div>
            );
        }

        // 5. Tabular (CSV / TSV) preview
        if (isTabular && textContent !== null && viewMode === 'formatted') {
            const delimiter = ext === 'tsv' ? '\t' : ',';
            const rows = parseDelimited(textContent, delimiter, 150);
            const header = rows[0] || [];
            const dataRows = rows.slice(1);

            return (
                <div className="preview-table-container">
                    <table className="preview-grid-table">
                        <thead>
                            <tr>
                                <th className="preview-th-idx">#</th>
                                {header.map((col, idx) => (
                                    <th key={idx}>{col || `Col ${idx + 1}`}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dataRows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                    <td className="preview-td-idx">{rIdx + 1}</td>
                                    {header.map((_, cIdx) => (
                                        <td key={cIdx}>{row[cIdx] ?? ''}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // 6. JSON preview
        if (isJson && textContent !== null && viewMode === 'formatted') {
            let formatted = textContent;
            try {
                formatted = JSON.stringify(JSON.parse(textContent), null, 2);
            } catch (e) {
                // Keep raw if invalid JSON
            }
            const lines = formatted.split(/\r?\n/);
            return (
                <div className="preview-code-container">
                    <table className="preview-code-table">
                        <tbody>
                            {lines.map((line, idx) => (
                                <tr key={idx}>
                                    <td className="preview-line-num">{idx + 1}</td>
                                    <td className="preview-line-code">
                                        <code>{line}</code>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // 7. Markdown preview
        if (isMarkdown && textContent !== null && viewMode === 'formatted') {
            return <div className="preview-markdown-scroll">{renderSimpleMarkdown(textContent)}</div>;
        }

        // 8. Text / Code / Raw view
        if (textContent !== null) {
            const lines = textContent.split(/\r?\n/);
            return (
                <div className="preview-code-container">
                    <table className="preview-code-table">
                        <tbody>
                            {lines.map((line, idx) => (
                                <tr key={idx}>
                                    <td className="preview-line-num">{idx + 1}</td>
                                    <td className="preview-line-code">
                                        <code>{line}</code>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // 9. Parquet or unknown binary file
        return (
            <div className="preview-unknown-card">
                {isParquet ? (
                    <FileSpreadsheet size={54} className="preview-card-icon" />
                ) : (
                    <File size={54} className="preview-card-icon" />
                )}
                <div className="preview-card-title">{name}</div>
                <div className="preview-card-subtitle">
                    {isParquet ? 'Apache Parquet Data File' : `${ext ? ext.toUpperCase() : 'Binary'} File`}
                </div>
                <div className="preview-card-path">{absolute}</div>
                <div className="preview-card-hint">
                    This file format is not directly rendered as text. You can attempt to view its raw contents, or open it with your system default app.
                </div>
                <div className="preview-card-actions">
                    <button
                        type="button"
                        className="btn"
                        onClick={() => setForceText(true)}
                    >
                        <FileText size={13} /> Try to View as Text
                    </button>
                    {onOpenExternal && (
                        <button
                            type="button"
                            className="btn is-primary"
                            onClick={() => onOpenExternal(rel)}
                        >
                            <ExternalLink size={13} /> Open in Default App
                        </button>
                    )}
                    {onReveal && (
                        <button
                            type="button"
                            className="btn is-ghost"
                            onClick={() => onReveal(rel)}
                        >
                            <FolderSearch size={13} /> Reveal in Folder
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="backdrop is-flush" onMouseDown={onClose}>
            <div
                className="modal is-wide preview-modal"
                onMouseDown={(ev) => ev.stopPropagation()}
            >
                {/* Header */}
                <div className="preview-modal-header">
                    <div className="preview-header-left">
                        {getIcon()}
                        <span className="preview-header-name" title={rel}>
                            {name}
                        </span>
                        <span className="preview-header-rel">{rel}</span>
                        {imgDimensions && (
                            <span className="preview-badge">
                                {imgDimensions.width} × {imgDimensions.height} px
                            </span>
                        )}
                        {textContent !== null && (
                            <span className="preview-badge">
                                {textContent.split(/\r?\n/).length} lines
                            </span>
                        )}
                    </div>

                    <div className="preview-header-controls">
                        {/* Zoom controls for images */}
                        {isImage && !forceText && (
                            <div className="preview-btn-group">
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Zoom Out"
                                    onClick={() => setZoom((z) => Math.max(25, z - 25))}
                                >
                                    <ZoomOut size={13} />
                                </button>
                                <span className="preview-zoom-label">{zoom}%</span>
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Zoom In"
                                    onClick={() => setZoom((z) => Math.min(400, z + 25))}
                                >
                                    <ZoomIn size={13} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-btn is-small"
                                    title="Reset Zoom"
                                    onClick={() => setZoom(100)}
                                >
                                    <RotateCcw size={13} />
                                </button>
                            </div>
                        )}

                        {/* Toggle formatted vs raw for Markdown or CSV */}
                        {(isMarkdown || isTabular || isJson) && textContent !== null && (
                            <div className="preview-btn-group">
                                <button
                                    type="button"
                                    className={`btn is-small ${viewMode === 'formatted' ? 'is-active' : 'is-ghost'}`}
                                    onClick={() => setViewMode('formatted')}
                                >
                                    {isTabular ? <TableIcon size={12} /> : isMarkdown ? <Eye size={12} /> : <Code size={12} />}
                                    {isTabular ? 'Table' : 'Formatted'}
                                </button>
                                <button
                                    type="button"
                                    className={`btn is-small ${viewMode === 'raw' ? 'is-active' : 'is-ghost'}`}
                                    onClick={() => setViewMode('raw')}
                                >
                                    <FileCode2 size={12} /> Raw
                                </button>
                            </div>
                        )}

                        {textContent !== null && (
                            <button
                                type="button"
                                className="icon-btn is-small"
                                title="Copy Content"
                                onClick={copyContent}
                            >
                                <Copy size={13} />
                            </button>
                        )}

                        <button
                            type="button"
                            className="icon-btn is-small"
                            title="Close Preview (Esc)"
                            onClick={onClose}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="preview-modal-body">
                    {renderContent()}
                </div>

                {/* Footer */}
                <div className="preview-modal-footer">
                    <div className="preview-footer-left">
                        <button
                            type="button"
                            className="btn is-ghost is-small"
                            onClick={copyPath}
                            title="Copy absolute path"
                        >
                            <Copy size={12} /> Copy Path
                        </button>
                        {onReveal && (
                            <button
                                type="button"
                                className="btn is-ghost is-small"
                                onClick={() => onReveal(rel)}
                                title="Reveal in Finder / Explorer"
                            >
                                <FolderSearch size={12} /> Reveal
                            </button>
                        )}
                    </div>

                    <div className="preview-footer-right">
                        {onOpenInEditor && CODE_EXTS.has(ext) && (
                            <button
                                type="button"
                                className="btn is-small"
                                onClick={() => onOpenInEditor(rel)}
                            >
                                <FileCode2 size={13} /> Open in Editor
                            </button>
                        )}
                        {onOpenExternal && (
                            <button
                                type="button"
                                className="btn is-ghost is-small"
                                onClick={() => onOpenExternal(rel)}
                                title="Open in default system application"
                            >
                                <ExternalLink size={12} /> Open in Default App
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn is-primary is-small"
                            onClick={onClose}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
