import { useMemo, useState } from "react";
import {
  Check,
  Download,
  Pencil,
  Plus,
  Puzzle,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FieldLabel, PageHeading, Select } from "@/components/layout";
import { downloadTextFile } from "@/lib/csv";
import {
  CUSTOM_UNITS_MAX,
  createCustomUnit,
  customUnitDimensions,
  loadCustomUnits,
  parseCustomUnitsDocument,
  saveCustomUnits,
  serializeCustomUnits,
  updateCustomUnit,
  validateCustomUnitInput,
  type CustomUnit,
  type CustomUnitInput,
} from "@/lib/custom-units";

interface FormState {
  name: string;
  symbol: string;
  dimension: string;
  scale: string;
  offset: string;
  precision: string;
}

const EMPTY_FORM: FormState = { name: "", symbol: "", dimension: "length", scale: "1", offset: "0", precision: "4" };

function toNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return Number.NaN;
  return Number(trimmed);
}

function formToInput(form: FormState): CustomUnitInput {
  return {
    name: form.name,
    symbol: form.symbol,
    dimension: form.dimension,
    scale: toNumber(form.scale),
    offset: form.dimension === "temperature" ? toNumber(form.offset) : 0,
    precision: toNumber(form.precision),
  };
}

function unitToForm(unit: CustomUnit): FormState {
  return {
    name: unit.name,
    symbol: unit.symbol,
    dimension: unit.dimension,
    scale: String(unit.scale),
    offset: String(unit.offset),
    precision: String(unit.precision),
  };
}

export default function CustomUnitsPage() {
  const dimensions = useMemo(() => customUnitDimensions(), []);
  const [units, setUnits] = useState<CustomUnit[]>(() => loadCustomUnits(localStorage));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [importText, setImportText] = useState("");
  const [importMessages, setImportMessages] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] });

  const dimensionName = (id: string) => dimensions.find((item) => item.id === id)?.name ?? id;
  const isTemperature = form.dimension === "temperature";

  const persist = (next: CustomUnit[]) => {
    setUnits(next);
    saveCustomUnits(localStorage, next);
  };

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const startEdit = (unit: CustomUnit) => {
    setEditingId(unit.id);
    setForm(unitToForm(unit));
    setErrors({});
  };

  const submit = () => {
    const input = formToInput(form);
    const result = validateCustomUnitInput(input, { existing: units, ignoreId: editingId ?? undefined });
    setErrors(result.errors);
    if (!result.ok || !result.value) return;

    if (editingId) {
      const existing = units.find((unit) => unit.id === editingId);
      if (!existing) { resetForm(); return; }
      persist(units.map((unit) => (unit.id === editingId ? updateCustomUnit(existing, result.value!) : unit)));
      flash(`Updated "${result.value.name}".`);
    } else {
      if (units.length >= CUSTOM_UNITS_MAX) {
        setErrors({ name: `You can store up to ${CUSTOM_UNITS_MAX} custom units.` });
        return;
      }
      persist([...units, createCustomUnit(result.value)]);
      flash(`Added "${result.value.name}".`);
    }
    resetForm();
  };

  const remove = (unit: CustomUnit) => {
    if (!window.confirm(`Delete "${unit.name}"? This cannot be undone.`)) return;
    if (editingId === unit.id) resetForm();
    persist(units.filter((item) => item.id !== unit.id));
    flash(`Deleted "${unit.name}".`);
  };

  const exportUnits = () => {
    downloadTextFile("omni-custom-units.json", serializeCustomUnits(units), "application/json");
    flash(`Exported ${units.length} custom unit${units.length === 1 ? "" : "s"}.`);
  };

  const runImport = () => {
    const result = parseCustomUnitsDocument(importText);
    setImportMessages({ errors: result.errors, warnings: result.warnings });
    if (!result.ok || result.units.length === 0) return;

    const merged = [...units];
    let added = 0;
    let skipped = 0;
    for (const unit of result.units) {
      if (merged.length >= CUSTOM_UNITS_MAX) { skipped += 1; continue; }
      const clash = merged.some(
        (existing) =>
          existing.id === unit.id ||
          (existing.dimension === unit.dimension && existing.symbol.toLowerCase() === unit.symbol.toLowerCase()),
      );
      if (clash) { skipped += 1; continue; }
      merged.push(unit);
      added += 1;
    }
    persist(merged);
    setImportText("");
    const parts = [`Imported ${added} unit${added === 1 ? "" : "s"}`];
    if (skipped) parts.push(`${skipped} skipped as duplicates or over the limit`);
    parts.push(`${merged.length} total`);
    flash(parts.join(" · "));
  };

  const groupedByDimension = useMemo(() => {
    const map = new Map<string, CustomUnit[]>();
    for (const unit of units) {
      const list = map.get(unit.dimension) ?? [];
      list.push(unit);
      map.set(unit.dimension, list);
    }
    return [...map.entries()].sort((a, b) => dimensionName(a[0]).localeCompare(dimensionName(b[0])));
  }, [units, dimensions]);

  return (
    <>
      <PageHeading
        eyebrow="Custom units"
        title="Define the units you actually use."
        description="Add your own units for any multiplicative measure, plus offset temperature scales. Definitions stay on this device."
        aside={
          <div className="flex flex-wrap gap-2">
            <button onClick={exportUnits} disabled={units.length === 0} data-testid="button-export-units" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
              <Download size={14} /> Export
            </button>
          </div>
        }
      />

      {notice && <p role="status" data-testid="status-units-notice" className="mb-4 flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3 text-xs text-primary"><Check size={13} />{notice}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          {groupedByDimension.length === 0 ? (
            <div className="card-surface flex min-h-[280px] flex-col items-center justify-center rounded-[24px] px-6 text-center" data-testid="empty-custom-units">
              <Puzzle size={26} className="mb-3 text-muted-foreground" />
              <div className="display-font text-lg font-bold">No custom units yet.</div>
              <p className="mb-0 mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">Use the form to define a unit, or import a definitions file you previously exported.</p>
            </div>
          ) : (
            groupedByDimension.map(([dimension, list]) => (
              <div key={dimension} className="card-surface overflow-hidden rounded-[22px]">
                <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/25 text-sm font-semibold">{dimensions.find((item) => item.id === dimension)?.icon ?? "?"}</span>
                    <span className="text-sm font-bold">{dimensionName(dimension)}</span>
                    <span className="text-[11px] text-muted-foreground">{list.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {list.map((unit) => (
                    <div key={unit.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6" data-testid={`card-custom-unit-${unit.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{unit.name}</span>
                          <span className="mono text-xs text-muted-foreground">{unit.symbol}</span>
                        </div>
                        <div className="mono mt-1 text-[11px] text-muted-foreground">
                          base = value × {unit.scale}{unit.offset !== 0 ? ` + ${unit.offset}` : ""} · {unit.precision} dp
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(unit)} data-testid={`button-edit-unit-${unit.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold hover:bg-muted">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => remove(unit)} data-testid={`button-delete-unit-${unit.id}`} aria-label={`Delete ${unit.name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Upload size={16} className="text-primary" />
              <span className="text-sm font-bold">Import definitions</span>
            </div>
            <p className="mb-3 mt-0 text-xs leading-5 text-muted-foreground">Paste an exported document. Imports never execute code and duplicates are skipped automatically.</p>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              spellCheck={false}
              placeholder={'{ "version": 1, "exportedAt": "…", "units": [ … ] }'}
              data-testid="input-units-import"
              className="mono h-28 w-full resize-y rounded-xl border border-input bg-background p-3 text-[11px] leading-5 outline-none focus:border-primary"
            />
            <button onClick={runImport} disabled={!importText.trim()} data-testid="button-run-import" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
              <Upload size={13} /> Validate & import
            </button>
            {importMessages.errors.length > 0 && (
              <ul className="mb-0 mt-3 space-y-1 rounded-lg bg-destructive/10 px-4 py-3 text-[11px] text-destructive" data-testid="list-import-errors">
                {importMessages.errors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
            {importMessages.warnings.length > 0 && (
              <ul className="mb-0 mt-3 space-y-1 rounded-lg bg-accent/15 px-4 py-3 text-[11px]" data-testid="list-import-warnings">
                {importMessages.warnings.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
            {importMessages.errors.length === 0 && importMessages.warnings.length === 0 && importText.trim() === "" && (
              <p className="mb-0 mt-3 text-[11px] text-muted-foreground">Nothing imported yet.</p>
            )}
          </div>
        </section>

        <aside>
          <div className="card-surface sticky top-24 rounded-[22px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">{editingId ? "Editing" : "New unit"}</div>
                <div className="mt-1 text-sm font-bold">{editingId ? form.name || "Custom unit" : "Create a definition"}</div>
              </div>
              {editingId && (
                <button onClick={resetForm} aria-label="Cancel editing" data-testid="button-cancel-edit" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor="unit-name">Name</FieldLabel>
                <input id="unit-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-unit-name" placeholder="Furlong" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                {errors.name && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.name}</p>}
              </div>
              <div>
                <FieldLabel htmlFor="unit-symbol">Symbol</FieldLabel>
                <input id="unit-symbol" value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} data-testid="input-unit-symbol" placeholder="fur" className="mono h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                {errors.symbol && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.symbol}</p>}
              </div>
              <div>
                <FieldLabel htmlFor="unit-dimension">Dimension</FieldLabel>
                <Select label="Unit dimension" testId="select-unit-dimension" id="unit-dimension" value={form.dimension} onChange={(value) => setForm({ ...form, dimension: value, offset: value === "temperature" ? form.offset : "0" })}>
                  {dimensions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                {errors.dimension && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.dimension}</p>}
              </div>
              <div>
                <FieldLabel htmlFor="unit-scale">Scale (base = value × scale)</FieldLabel>
                <input id="unit-scale" inputMode="decimal" value={form.scale} onChange={(event) => setForm({ ...form, scale: event.target.value })} data-testid="input-unit-scale" className="mono h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                {errors.scale && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.scale}</p>}
              </div>
              {isTemperature && (
                <div>
                  <FieldLabel htmlFor="unit-offset">Offset (base = value × scale + offset)</FieldLabel>
                  <input id="unit-offset" inputMode="decimal" value={form.offset} onChange={(event) => setForm({ ...form, offset: event.target.value })} data-testid="input-unit-offset" className="mono h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                  {errors.offset && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.offset}</p>}
                </div>
              )}
              <div>
                <FieldLabel htmlFor="unit-precision">Display precision (0–12)</FieldLabel>
                <input id="unit-precision" inputMode="numeric" value={form.precision} onChange={(event) => setForm({ ...form, precision: event.target.value })} data-testid="input-unit-precision" className="mono h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                {errors.precision && <p className="mb-0 mt-1 text-[11px] text-destructive">{errors.precision}</p>}
              </div>
            </div>

            <button onClick={submit} data-testid="button-save-unit" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground hover:opacity-90">
              {editingId ? <Save size={14} /> : <Plus size={14} />}{editingId ? "Save changes" : "Add unit"}
            </button>

            <p className="mb-0 mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
              Custom units are defined directly against the dimension base, so circular definitions are impossible. Fuel economy is excluded because it is an inverse relationship.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
