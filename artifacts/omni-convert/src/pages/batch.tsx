import { useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  Search,
  Table2,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { FieldLabel, PageHeading, Select } from "@/components/layout";
import {
  CSV_LIMITS,
  detectDelimiter,
  downloadTextFile,
  parseCsv,
  serializeCsv,
} from "@/lib/csv";
import { looksLikeExpression, tryEvaluateExpression } from "@/lib/expression";
import { formatNumber, parseLocaleNumber } from "@/lib/number-format";
import { categories } from "@/lib/units";
import {
  convertBetweenOptions,
  loadCustomUnits,
  unitOptionsFor,
  type UnitOption,
} from "@/lib/custom-units";

type DelimiterChoice = "auto" | "," | ";" | "\t" | "|";
type FilterMode = "all" | "converted" | "errors";
type SortMode = "original" | "result-asc" | "result-desc" | "status";
type CellValue = "ok" | "error";

interface ComputedRow {
  index: number;
  cells: string[];
  valueText: string;
  parsed: number | null;
  result: number | null;
  error: string;
  status: CellValue;
}

const DELIMITER_OPTIONS: { value: DelimiterChoice; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: ",", label: "Comma ( , )" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe ( | )" },
];

const SAMPLE_CSV = [
  "route,kilometers,notes",
  "Morning commute,12.4,City driving",
  "Airport transfer,48.1,Highway",
  "Weekend loop,102.7,Extended tour",
  "Measurement error,not-a-number,Contains bad data",
  "Metric mile,1.609344,Exact definition",
].join("\n");

const PREVIEW_LIMIT = 250;

function parseValue(text: string, allowExpressions: boolean): { value: number | null; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, error: "Empty value" };
  if (allowExpressions && looksLikeExpression(trimmed)) {
    const result = tryEvaluateExpression(trimmed);
    return result.ok ? { value: result.value, error: "" } : { value: null, error: result.error ?? "Invalid expression" };
  }
  const result = parseLocaleNumber(trimmed);
  return result.ok ? { value: result.value, error: "" } : { value: null, error: result.error ?? "Invalid number" };
}

export default function BatchPage() {
  const [customUnits] = useState(() => loadCustomUnits(localStorage));
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [delimiter, setDelimiter] = useState<DelimiterChoice>("auto");
  const [hasHeader, setHasHeader] = useState(true);
  const [categoryId, setCategoryId] = useState("length");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [valueColumn, setValueColumn] = useState(0);
  const [columnsDeclared, setColumnsDeclared] = useState(true);
  const [titleColumn, setTitleColumn] = useState<number | "none">("none");
  const [allowExpressions, setAllowExpressions] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("original");
  const [search, setSearch] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const options = useMemo(() => unitOptionsFor(category, customUnits), [category, customUnits]);
  const fromOption = options.find((option) => option.id === fromId) ?? options[0]!;
  const toOption = options.find((option) => option.id === toId) ?? options[Math.min(1, options.length - 1)]!;

  const resolvedDelimiter = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  const parsed = useMemo(
    () => (text.trim() ? parseCsv(text, { delimiter: resolvedDelimiter, maxRows: CSV_LIMITS.maxRows }) : { rows: [], truncated: false, warnings: [] as string[] }),
    [text, resolvedDelimiter],
  );

  const columnCount = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerLabels = useMemo(() => {
    if (hasHeader && parsed.rows[0]) return parsed.rows[0];
    return Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  }, [hasHeader, parsed.rows, columnCount]);

  const dataRows = hasHeader ? parsed.rows.slice(1) : parsed.rows;

  const rows: ComputedRow[] = useMemo(() => {
    const column = Math.min(valueColumn, Math.max(0, columnCount - 1));
    return dataRows.map((cells, index) => {
      const valueText = cells[column] ?? "";
      const { value: parsedValue, error } = parseValue(valueText, allowExpressions);
      let result: number | null = null;
      let finalError = error;
      if (parsedValue !== null && !error) {
        if (category.id === "fuel" && parsedValue <= 0) {
          finalError = "Fuel economy must be greater than zero";
        } else {
          try {
            const converted = convertBetweenOptions(category, parsedValue, fromOption, toOption);
            if (!Number.isFinite(converted)) finalError = "Result is not a finite number";
            else result = converted;
          } catch (thrown) {
            finalError = thrown instanceof Error ? thrown.message : "Conversion failed";
          }
        }
      }
      return {
        index,
        cells,
        valueText,
        parsed: parsedValue,
        result,
        error: finalError,
        status: finalError ? "error" : "ok",
      };
    });
  }, [dataRows, valueColumn, columnCount, allowExpressions, category, fromOption, toOption]);

  const okCount = rows.filter((row) => row.status === "ok").length;
  const errorCount = rows.length - okCount;

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRows = useMemo(() => {
    let next = rows;
    if (filter === "converted") next = next.filter((row) => row.status === "ok");
    else if (filter === "errors") next = next.filter((row) => row.status === "error");
    if (normalizedSearch) {
      next = next.filter((row) =>
        row.cells.some((cell) => cell.toLocaleLowerCase().includes(normalizedSearch)) ||
        row.error.toLocaleLowerCase().includes(normalizedSearch),
      );
    }
    if (sort === "result-asc") next = [...next].sort((a, b) => (a.result ?? Infinity) - (b.result ?? Infinity));
    else if (sort === "result-desc") next = [...next].sort((a, b) => (b.result ?? -Infinity) - (a.result ?? -Infinity));
    else if (sort === "status") next = [...next].sort((a, b) => (a.status === b.status ? a.index - b.index : a.status === "error" ? -1 : 1));
    return next;
  }, [rows, filter, normalizedSearch, sort]);

  const previewRows = visibleRows.slice(0, PREVIEW_LIMIT);
  const totalBytes = text.length;

  const changeCategory = (id: string) => {
    const next = categories.find((item) => item.id === id) ?? categories[0];
    const nextOptions = unitOptionsFor(next, customUnits);
    setCategoryId(next.id);
    setFromId(nextOptions[0]!.id);
    setToId(nextOptions[Math.min(1, nextOptions.length - 1)]!.id);
  };

  const handleFile = async (file: File | undefined) => {
    setSourceError("");
    if (!file) return;
    if (file.size > CSV_LIMITS.maxBytes) {
      setSourceError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${(CSV_LIMITS.maxBytes / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setValueColumn(0);
    } catch {
      setSourceError("The file could not be read.");
    }
  };

  const loadSample = () => {
    setText(SAMPLE_CSV);
    setFileName("sample-routes.csv");
    setDelimiter("auto");
    setHasHeader(true);
    setCategoryId("length");
    const nextOptions = unitOptionsFor(categories.find((item) => item.id === "length")!, customUnits);
    setFromId(nextOptions.find((option) => option.symbol === "km")?.id ?? nextOptions[0]!.id);
    setToId(nextOptions.find((option) => option.symbol === "mi")?.id ?? nextOptions[1]!.id);
    setValueColumn(1);
    setTitleColumn(0);
    setAllowExpressions(false);
    setSourceError("");
  };

  const clearAll = () => {
    setText("");
    setFileName("");
    setSourceError("");
    setValueColumn(0);
    setSearch("");
    setFilter("all");
    setSort("original");
  };

  const exportRows = (): (string | number)[][] => {
    const srcLabel = hasHeader && parsed.rows[0]?.[valueColumn] ? parsed.rows[0]![valueColumn]! : `value`;
    const header = titleColumn === "none"
      ? ["row", srcLabel, `${toOption.symbol}`, "status", "message"]
      : ["row", headerLabels[titleColumn] ?? "label", srcLabel, `${toOption.symbol}`, "status", "message"];
    const body = rows.map((row) => {
      const base: (string | number)[] = [row.index + 1];
      if (titleColumn !== "none") base.push(row.cells[titleColumn] ?? "");
      base.push(row.valueText, row.result === null ? "" : formatNumber(row.result, { digits: 8, trimTrailingZeros: true }), row.status, row.error);
      return base;
    });
    return [header, ...body];
  };

  const downloadConverted = () => {
    const csv = serializeCsv(exportRows(), { delimiter: ",", protectFormulas: true });
    downloadTextFile(`omni-converted-${category.id}.csv`, csv);
    setNotice(`Exported ${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}.`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      source: fileName || "pasted text",
      delimiter: resolvedDelimiter,
      category: { id: category.id, name: category.name },
      from: { symbol: fromOption.symbol, name: fromOption.name },
      to: { symbol: toOption.symbol, name: toOption.name },
      statistics: { rows: rows.length, converted: okCount, errors: errorCount },
      warnings: parsed.warnings,
      failures: rows.filter((row) => row.status === "error").map((row) => ({ row: row.index + 1, value: row.valueText, message: row.error })),
    };
    downloadTextFile(`omni-batch-report-${category.id}.json`, JSON.stringify(report, null, 2), "application/json");
    setNotice("Report downloaded.");
    window.setTimeout(() => setNotice(""), 2600);
  };

  const tooBig = totalBytes > CSV_LIMITS.maxBytes;

  return (
    <>
      <PageHeading
        eyebrow="Batch lab"
        title="Convert a whole table at once."
        description="Paste or upload a CSV, choose your units, and convert every row on your device. Nothing is uploaded."
        aside={
          <div className="flex flex-wrap gap-2">
            <button onClick={loadSample} data-testid="button-load-sample" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted">
              <FlaskConical size={14} /> Try a sample
            </button>
            <button onClick={() => fileInputRef.current?.click()} data-testid="button-upload-csv" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90">
              <Upload size={14} /> Upload CSV
            </button>
          </div>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        data-testid="input-csv-file"
        onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">01 / Source data</div>
                <div className="mt-1 text-sm font-bold">{fileName || "Paste CSV or upload a file"}</div>
              </div>
              {text && (
                <button onClick={clearAll} data-testid="button-clear-source" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-destructive/40 hover:text-destructive">
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>
            <textarea
              value={text}
              onChange={(event) => { setText(event.target.value); setFileName(""); setSourceError(""); setValueColumn(0); }}
              spellCheck={false}
              placeholder={"label,value\nApartment,72.5\nOffice,140"}
              data-testid="input-csv-text"
              className="mono h-40 w-full resize-y rounded-xl border border-input bg-background p-4 text-xs leading-5 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className={tooBig ? "font-semibold text-destructive" : ""}>
                {(totalBytes / 1024).toFixed(0)} KB / {(CSV_LIMITS.maxBytes / 1024).toFixed(0)} KB limit
              </span>
              <span>· Up to {CSV_LIMITS.maxRows.toLocaleString()} rows and {CSV_LIMITS.maxColumns} columns</span>
            </div>
            {(sourceError || tooBig) && (
              <p role="alert" data-testid="status-source-error" className="mb-0 mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <CircleAlert size={14} /> {sourceError || "This data is larger than the batch limit. Trim it before converting."}
              </p>
            )}
            {parsed.warnings.length > 0 && (
              <ul className="mb-0 mt-3 space-y-1 rounded-lg bg-accent/15 px-4 py-3 text-[11px] text-foreground" data-testid="list-source-warnings">
                {parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
          </section>

          <section className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">02 / Conversion setup</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="batch-category">Category</FieldLabel>
                <Select label="Batch category" testId="select-batch-category" id="batch-category" value={categoryId} onChange={changeCategory}>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="batch-delimiter">Delimiter</FieldLabel>
                <Select label="CSV delimiter" testId="select-batch-delimiter" id="batch-delimiter" value={delimiter} onChange={(value) => setDelimiter(value as DelimiterChoice)}>
                  {DELIMITER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="batch-from">From unit</FieldLabel>
                <Select label="Batch source unit" testId="select-batch-from" id="batch-from" value={fromOption.id} onChange={setFromId}>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.symbol}){option.source === "custom" ? " · custom" : ""}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="batch-to">To unit</FieldLabel>
                <Select label="Batch target unit" testId="select-batch-to" id="batch-to" value={toOption.id} onChange={setToId}>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.symbol}){option.source === "custom" ? " · custom" : ""}</option>)}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="batch-value-column">Value column</FieldLabel>
                <select
                  id="batch-value-column"
                  aria-label="Value column"
                  data-testid="select-batch-value-column"
                  value={Math.min(valueColumn, Math.max(0, columnCount - 1))}
                  onChange={(event) => setValueColumn(Number(event.target.value))}
                  disabled={columnCount === 0}
                  className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm font-semibold outline-none focus:border-primary disabled:opacity-50"
                >
                  {columnCount === 0 && <option value={0}>No columns detected</option>}
                  {headerLabels.map((label, index) => <option key={index} value={index}>{index + 1}. {label || `Column ${index + 1}`}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="batch-title-column">Label column (optional)</FieldLabel>
                <select
                  id="batch-title-column"
                  aria-label="Label column"
                  data-testid="select-batch-title-column"
                  value={titleColumn === "none" ? "none" : String(titleColumn)}
                  onChange={(event) => setTitleColumn(event.target.value === "none" ? "none" : Number(event.target.value))}
                  disabled={columnCount === 0}
                  className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm font-semibold outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="none">None</option>
                  {headerLabels.map((label, index) => <option key={index} value={index}>{index + 1}. {label || `Column ${index + 1}`}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} data-testid="checkbox-batch-header" className="h-4 w-4 accent-[hsl(var(--primary))]" />
                First row is a header
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={allowExpressions} onChange={(event) => setAllowExpressions(event.target.checked)} data-testid="checkbox-batch-expressions" className="h-4 w-4 accent-[hsl(var(--primary))]" />
                <Wand2 size={13} /> Evaluate expressions (e.g. 12*3.5)
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={columnsDeclared} onChange={(event) => setColumnsDeclared(event.target.checked)} data-testid="checkbox-batch-declared" className="h-4 w-4 accent-[hsl(var(--primary))]" />
                Enforce column limit
              </label>
            </div>
          </section>

          <section className="card-surface overflow-hidden rounded-[22px]">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
              <div className="flex items-center gap-2">
                <Table2 size={16} className="text-primary" />
                <span className="text-sm font-bold">Preview</span>
                <span className="text-[11px] text-muted-foreground" data-testid="text-batch-stats">
                  {rows.length.toLocaleString()} rows · {okCount.toLocaleString()} converted{errorCount ? ` · ${errorCount.toLocaleString()} errors` : ""}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search rows…"
                    aria-label="Search rows"
                    data-testid="input-batch-search"
                    className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none focus:border-primary md:w-44"
                  />
                </div>
                <select aria-label="Filter rows" data-testid="select-batch-filter" value={filter} onChange={(event) => setFilter(event.target.value as FilterMode)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-semibold outline-none">
                  <option value="all">All rows</option>
                  <option value="converted">Converted only</option>
                  <option value="errors">Errors only</option>
                </select>
                <select aria-label="Sort rows" data-testid="select-batch-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs font-semibold outline-none">
                  <option value="original">Original order</option>
                  <option value="result-asc">Result ascending</option>
                  <option value="result-desc">Result descending</option>
                  <option value="status">Errors first</option>
                </select>
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center" data-testid="empty-batch">
                <Table2 size={26} className="mb-3 text-muted-foreground" />
                <p className="m-0 max-w-[380px] text-xs leading-5 text-muted-foreground">Paste CSV data or upload a file to see a row-by-row preview with inline validation.</p>
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center px-6 text-center text-xs text-muted-foreground" data-testid="empty-batch-filtered">
                No rows match the current filter or search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[.08em] text-muted-foreground">
                      <th className="px-4 py-3 font-bold">#</th>
                      {headerLabels.map((label, index) => (
                        <th key={index} className="whitespace-nowrap px-4 py-3 font-bold">{label || `Column ${index + 1}`}</th>
                      ))}
                      <th className="whitespace-nowrap px-4 py-3 font-bold text-primary">{toOption.symbol}</th>
                      <th className="whitespace-nowrap px-4 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.index} className="border-b border-border/60 last:border-0" data-testid={`row-batch-${row.index}`}>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.index + 1}</td>
                        {headerLabels.map((_, index) => (
                          <td key={index} className="max-w-[180px] truncate px-4 py-2.5">{row.cells[index] ?? ""}</td>
                        ))}
                        <td className="mono whitespace-nowrap px-4 py-2.5 font-semibold text-primary">
                          {row.result === null ? "—" : formatNumber(row.result, { digits: 6, trimTrailingZeros: true })}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.status === "ok" ? (
                            <span className="inline-flex items-center gap-1.5 text-primary"><Check size={13} /> OK</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-destructive" title={row.error}><CircleAlert size={13} /> {row.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleRows.length > PREVIEW_LIMIT && (
                  <div className="border-t border-border px-4 py-3 text-center text-[11px] text-muted-foreground">
                    Showing the first {PREVIEW_LIMIT} of {visibleRows.length.toLocaleString()} matching rows. Exports include every row.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">03 / Results</div>
            <dl className="m-0 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-xs text-muted-foreground">Rows read</dt>
                <dd className="mono m-0 font-bold">{rows.length.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-xs text-muted-foreground">Converted</dt>
                <dd className="mono m-0 font-bold text-primary" data-testid="text-batch-converted">{okCount.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-xs text-muted-foreground">With errors</dt>
                <dd className={`mono m-0 font-bold ${errorCount ? "text-destructive" : ""}`} data-testid="text-batch-errors">{errorCount.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs text-muted-foreground">Delimiter</dt>
                <dd className="mono m-0 font-bold">{resolvedDelimiter === "\t" ? "Tab" : resolvedDelimiter}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs text-muted-foreground">Columns</dt>
                <dd className="mono m-0 font-bold">{columnCount}</dd>
              </div>
            </dl>
            {columnsDeclared && columnCount > CSV_LIMITS.maxColumns && (
              <p className="mb-0 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                {columnCount} columns exceeds the {CSV_LIMITS.maxColumns}-column limit.
              </p>
            )}
            <div className="mt-5 space-y-2">
              <button onClick={downloadConverted} disabled={rows.length === 0} data-testid="button-download-converted" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40">
                <FileSpreadsheet size={14} /> Download converted CSV
              </button>
              <button onClick={downloadReport} disabled={rows.length === 0} data-testid="button-download-report" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                <FileJson size={14} /> Download JSON report
              </button>
            </div>
            {notice && <p role="status" data-testid="status-batch-notice" className="mb-0 mt-3 flex items-center gap-2 text-[11px] text-primary"><Check size={13} />{notice}</p>}
          </div>

          <div className="rounded-[22px] bg-[#173d3a] p-5 text-[#eef4e8] md:p-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#b5c9b7]"><Download size={14} /> How exports stay safe</div>
            <p className="mb-0 mt-4 text-sm leading-6">Converted files are written locally. Cells that begin with a formula character are neutralised so a spreadsheet cannot execute them, while genuine negative numbers are preserved.</p>
            <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-[#bdcec1]">Rows that fail validation keep their original text and an explanatory message.</div>
          </div>
        </aside>
      </div>
    </>
  );
}
