import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';

export type ImportSource = 'obsidian' | 'evernote' | 'joplin' | 'notion';

export interface ImportPreview {
  notes: number;
  folders: number;
  tags: number;
  attachments: number;
  payload: unknown;
}

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

export interface ImportItemError {
  item: string;
  message: string;
}

export interface ImportRunResult {
  succeeded: number;
  errors: ImportItemError[];
}

export interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  onParseImport: (files: FileList | File[], source: ImportSource) => Promise<ImportPreview>;
  onRunImport: (
    payload: unknown,
    onProgress: (p: ImportProgress) => void,
  ) => Promise<ImportRunResult>;
  onExportJson: () => Promise<void>;
  onExportMarkdownZip: (onProgress?: (p: { done: number; total: number }) => void) => Promise<void>;
}

type Tab = 'import' | 'export';
type ExportFormat = 'json' | 'zip';

const SOURCES: ReadonlyArray<{
  value: ImportSource;
  label: string;
  hint: string;
  accept: string;
}> = [
  {
    value: 'obsidian',
    label: 'Markdown / Obsidian Vault',
    hint: 'A folder of .md files, or a .zip of your vault.',
    accept: '.md,.markdown,.zip',
  },
  {
    value: 'evernote',
    label: 'Evernote (.enex)',
    hint: 'One or more .enex exports from Evernote.',
    accept: '.enex',
  },
  {
    value: 'joplin',
    label: 'Joplin (.jex / MD)',
    hint: 'A Joplin .jex archive, or an exported Markdown folder.',
    accept: '.jex,.md,.markdown',
  },
  {
    value: 'notion',
    label: 'Notion (MD + CSV .zip)',
    hint: 'A .zip from Notion using Export → Markdown & CSV.',
    accept: '.zip',
  },
];

const IMPORT_CONCURRENCY = 3;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong. Please try again.';
}

function percentOf(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

async function readEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    if (entry.name === '.DS_Store') return;
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: entry.fullPath.replace(/^\//, ''),
      configurable: true,
    });
    out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) break;
      for (const child of batch) {
        await readEntry(child, out);
      }
    }
  }
}

async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  // DataTransfer is only valid synchronously, so capture everything before awaiting.
  const fallback = Array.from(dataTransfer.files);
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return fallback;

  const files: File[] = [];
  for (const entry of entries) {
    await readEntry(entry, files);
  }
  return files.length > 0 ? files : fallback;
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressBar({
  percent,
  label,
  indeterminate = false,
}: {
  percent: number;
  label: string;
  indeterminate?: boolean;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
      className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
    >
      <div
        className={`h-full rounded-full bg-blue-600 transition-[width] duration-200 ${
          indeterminate ? 'w-1/3 animate-pulse' : ''
        }`}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 break-words"
    >
      {children}
    </div>
  );
}

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';

export function ImportExportModal({
  open,
  onClose,
  onParseImport,
  onRunImport,
  onExportJson,
  onExportMarkdownZip,
}: ImportExportModalProps) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const parseRequestRef = useRef(0);

  const [tab, setTab] = useState<Tab>('import');

  const [source, setSource] = useState<ImportSource>('obsidian');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  const busy = parsing || importing || exporting;
  const sourceConfig = SOURCES.find((s) => s.value === source) ?? SOURCES[0]!;

  const resetImport = useCallback(() => {
    parseRequestRef.current += 1;
    setFiles([]);
    setParsing(false);
    setParseError(null);
    setPreview(null);
    setImporting(false);
    setProgress(null);
    setResult(null);
    setRunError(null);
    setErrorsOpen(false);
    setDragOver(false);
  }, []);

  const resetExport = useCallback(() => {
    setExporting(false);
    setExportProgress(null);
    setExportError(null);
    setExportDone(false);
  }, []);

  useEffect(() => {
    if (open) return;
    resetImport();
    resetExport();
    setTab('import');
  }, [open, resetImport, resetExport]);

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  const parseFiles = useCallback(
    async (selected: File[], selectedSource: ImportSource) => {
      if (selected.length === 0) return;
      const requestId = ++parseRequestRef.current;
      setFiles(selected);
      setPreview(null);
      setResult(null);
      setRunError(null);
      setParseError(null);
      setParsing(true);
      try {
        const parsed = await onParseImport(selected, selectedSource);
        if (requestId === parseRequestRef.current) setPreview(parsed);
      } catch (error) {
        if (requestId === parseRequestRef.current) setParseError(errorMessage(error));
      } finally {
        if (requestId === parseRequestRef.current) setParsing(false);
      }
    },
    [onParseImport],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).filter((f) => f.name !== '.DS_Store');
    event.target.value = '';
    void parseFiles(selected, source);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (parsing || importing) return;
    try {
      const dropped = await collectDroppedFiles(event.dataTransfer);
      void parseFiles(dropped, source);
    } catch (error) {
      setParseError(errorMessage(error));
    }
  };

  const handleSourceChange = (next: ImportSource) => {
    setSource(next);
    resetImport();
  };

  const handleStartImport = async () => {
    if (!preview || importing) return;
    const total = preview.notes + preview.folders + preview.tags + preview.attachments;
    setImporting(true);
    setRunError(null);
    setResult(null);
    setErrorsOpen(false);
    setProgress({ done: 0, total, label: 'Starting import…' });
    try {
      const outcome = await onRunImport(preview.payload, (p) => setProgress(p));
      setResult(outcome);
      setErrorsOpen(outcome.errors.length > 0);
    } catch (error) {
      setRunError(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setExportDone(false);
    setExportProgress(null);
    try {
      if (exportFormat === 'json') {
        await onExportJson();
      } else {
        await onExportMarkdownZip((p) => setExportProgress(p));
      }
      setExportDone(true);
    } catch (error) {
      setExportError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const titleId = `${baseId}-title`;
  const showDropzone = !preview && !importing && !result;
  const exportPercent = exportProgress ? percentOf(exportProgress.done, exportProgress.total) : 0;
  const previewIsEmpty =
    preview !== null &&
    preview.notes + preview.folders + preview.tags + preview.attachments === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-gray-200 bg-white text-gray-900 shadow-xl outline-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
          <h2 id={titleId} className="text-sm font-semibold">
            Import / Export
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="border-b border-gray-200 px-4 py-3">
          <div
            role="tablist"
            aria-label="Import or export"
            className="grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1"
          >
            {(['import', 'export'] as const).map((value) => {
              const selected = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${value}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${value}`}
                  disabled={busy && !selected}
                  onClick={() => setTab(value)}
                  className={`min-h-11 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {value === 'import' ? 'Import' : 'Export'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
          {tab === 'import' ? (
            <div
              role="tabpanel"
              id={`${baseId}-panel-import`}
              aria-labelledby={`${baseId}-tab-import`}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor={`${baseId}-source`} className="text-sm font-medium">
                  Import from
                </label>
                <select
                  id={`${baseId}-source`}
                  value={source}
                  onChange={(event) => handleSourceChange(event.target.value as ImportSource)}
                  disabled={parsing || importing}
                  className="min-h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500">{sourceConfig.hint}</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={sourceConfig.accept}
                onChange={handleInputChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                onChange={handleInputChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />

              {showDropzone && (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!parsing) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  aria-busy={parsing}
                  className={`flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center ${
                    dragOver ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {parsing ? (
                    <div className="flex flex-col items-center gap-2 text-sm text-gray-500" role="status">
                      <Spinner className="h-5 w-5 text-blue-600" />
                      <span className="break-words">
                        Reading {files.length === 1 ? files[0]?.name : `${files.length} files`}…
                      </span>
                    </div>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-500" fill="none" aria-hidden="true">
                        <path
                          d="M12 16V5m0 0L8 9m4-4l4 4M5 19h14"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <p className="text-sm text-gray-900">Drag files or a folder here</p>
                      <p className="text-sm text-gray-500">.zip, .enex, .jex, .md or a directory</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Choose files
                        </button>
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => folderInputRef.current?.click()}
                        >
                          Choose folder
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {parseError && <ErrorBox>{parseError}</ErrorBox>}

              {preview && !importing && !result && (
                <section
                  aria-label="Import preview"
                  className="flex flex-col gap-3 rounded-md border border-gray-200 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold">Ready to import</h3>
                    <p className="text-sm text-gray-500 break-words">
                      {files.length === 1 ? files[0]?.name : `${files.length} files selected`}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ['Notes', preview.notes],
                        ['Folders', preview.folders],
                        ['Tags', preview.tags],
                        ['Attachments', preview.attachments],
                      ] as const
                    ).map(([label, count]) => (
                      <div key={label} className="rounded-md bg-gray-50 px-3 py-2">
                        <dt className="text-sm text-gray-500">{label}</dt>
                        <dd className="text-sm font-semibold tabular-nums">{count}</dd>
                      </div>
                    ))}
                  </dl>
                  {previewIsEmpty && (
                    <p className="text-sm text-gray-500">
                      Nothing importable was found. Check the selected format and try again.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={secondaryButton} onClick={resetImport}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={primaryButton}
                      onClick={handleStartImport}
                      disabled={previewIsEmpty}
                    >
                      Start Import
                    </button>
                  </div>
                </section>
              )}

              {importing && progress && (
                <section
                  aria-label="Import progress"
                  aria-live="polite"
                  className="flex flex-col gap-2 rounded-md border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium tabular-nums">
                      {progress.done} / {progress.total}
                    </span>
                    <span className="tabular-nums text-gray-500">
                      {percentOf(progress.done, progress.total)}%
                    </span>
                  </div>
                  <ProgressBar
                    percent={percentOf(progress.done, progress.total)}
                    label="Import progress"
                  />
                  <p className="flex items-center gap-2 text-sm text-gray-500">
                    <Spinner className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{progress.label}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Sending up to {IMPORT_CONCURRENCY} requests at a time. Keep this window open.
                  </p>
                </section>
              )}

              {runError && <ErrorBox>{runError}</ErrorBox>}

              {result && (
                <section
                  aria-label="Import results"
                  className="flex flex-col gap-3 rounded-md border border-gray-200 p-4"
                >
                  <p className="text-sm font-semibold">
                    {result.succeeded} succeeded, {result.errors.length} failed
                  </p>
                  {result.errors.length === 0 ? (
                    <p className="text-sm text-gray-500">Every item was imported.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        aria-expanded={errorsOpen}
                        aria-controls={`${baseId}-errors`}
                        onClick={() => setErrorsOpen((v) => !v)}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-left text-sm font-medium text-red-700 focus-visible:outline-2 focus-visible:outline-red-700"
                      >
                        <span>
                          {result.errors.length} failed {result.errors.length === 1 ? 'item' : 'items'}
                        </span>
                        <svg
                          viewBox="0 0 20 20"
                          className={`h-4 w-4 shrink-0 transition-transform ${errorsOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M5 8l5 5 5-5"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {errorsOpen && (
                        <ul
                          id={`${baseId}-errors`}
                          className="max-h-48 divide-y divide-gray-200 overflow-y-auto rounded-md border border-gray-200"
                        >
                          {result.errors.map((err, index) => (
                            <li key={`${err.item}-${index}`} className="flex flex-col gap-0.5 px-3 py-2">
                              <span className="text-sm font-medium break-words">{err.item}</span>
                              <span className="text-sm text-red-700 break-words">{err.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={secondaryButton} onClick={resetImport}>
                      Import more
                    </button>
                    <button type="button" className={primaryButton} onClick={onClose}>
                      Done
                    </button>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div
              role="tabpanel"
              id={`${baseId}-panel-export`}
              aria-labelledby={`${baseId}-tab-export`}
              className="flex flex-col gap-4"
            >
              <fieldset className="flex flex-col gap-2" disabled={exporting}>
                <legend className="mb-1 text-sm font-medium">Export workspace as</legend>
                {(
                  [
                    {
                      value: 'json',
                      title: 'Workspace JSON',
                      description:
                        'Full backup: all active, archived and trashed notes, plus folders and tags.',
                    },
                    {
                      value: 'zip',
                      title: 'Markdown ZIP',
                      description:
                        'Folders become directories, notes become .md files with YAML frontmatter, plus an attachments manifest.',
                    },
                  ] as const
                ).map((option) => {
                  const selected = exportFormat === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 ${
                        selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${baseId}-export-format`}
                        value={option.value}
                        checked={selected}
                        onChange={() => {
                          setExportFormat(option.value);
                          setExportDone(false);
                          setExportError(null);
                        }}
                        className="mt-1 h-4 w-4 accent-blue-600"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium">{option.title}</span>
                        <span className="text-sm text-gray-500">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {exporting && (
                <div className="flex flex-col gap-2" role="status" aria-live="polite">
                  <ProgressBar
                    percent={exportPercent}
                    indeterminate={!exportProgress}
                    label="Export progress"
                  />
                  <p className="text-sm text-gray-500">
                    {exportProgress
                      ? `Packing ${exportProgress.done} of ${exportProgress.total} items…`
                      : 'Preparing your download…'}
                  </p>
                </div>
              )}

              {exportError && <ErrorBox>{exportError}</ErrorBox>}

              {exportDone && !exporting && !exportError && (
                <p className="text-sm text-gray-500" role="status">
                  Export complete. Check your Downloads folder.
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  className={primaryButton}
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting && <Spinner />}
                  {exporting ? 'Exporting…' : 'Download'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportExportModal;
