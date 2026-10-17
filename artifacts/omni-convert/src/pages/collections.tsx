import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  Download,
  Layers,
  Link2,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { FieldLabel, PageHeading, Select } from "@/components/layout";
import { downloadTextFile } from "@/lib/csv";
import { formatNumber, parseLocaleNumber } from "@/lib/number-format";
import { categories, categoryById } from "@/lib/units";
import {
  builtInCollections,
  createCollection,
  decodeCollection,
  encodeCollection,
  loadCollections,
  saveCollections,
  validateConversionConfig,
  type ConversionCollection,
  type ConversionConfig,
  type SharedCollectionPayload,
} from "@/lib/collections";
import {
  convertBetweenOptions,
  loadCustomUnits,
  unitOptionsFor,
  type CustomUnit,
} from "@/lib/custom-units";

const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "INR", "JPY", "CNY", "AED", "SAR", "SGD", "AUD",
  "CAD", "CHF", "HKD", "KRW", "BDT", "NZD", "ZAR", "SEK", "NOK", "MXN",
];

function symbolsFor(categoryId: string, customUnits: readonly CustomUnit[]): { symbol: string; name: string }[] {
  if (categoryId === "currency") return CURRENCY_CODES.map((code) => ({ symbol: code, name: code }));
  const category = categoryById(categoryId) ?? categories[0];
  return unitOptionsFor(category, customUnits).map((option) => ({ symbol: option.symbol, name: option.name }));
}

function describeItem(item: ConversionConfig): string {
  const label = item.category === "currency" ? "Currency" : categoryById(item.category)?.name ?? item.category;
  return `${label} · ${item.from} → ${item.to}`;
}

export default function CollectionsPage() {
  const [customUnits] = useState(() => loadCustomUnits(localStorage));
  const [collections, setCollections] = useState<ConversionCollection[]>(() => loadCollections(localStorage));
  const [notice, setNotice] = useState("");
  const [, setLocation] = useLocation();
  const [pendingImport, setPendingImport] = useState<SharedCollectionPayload | null>(null);
  const [importToken, setImportToken] = useState("");
  const [importError, setImportError] = useState("");

  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftItems, setDraftItems] = useState<ConversionConfig[]>([]);
  const [draftCategory, setDraftCategory] = useState("length");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftError, setDraftError] = useState("");

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("import");
    if (!token) return;
    const decoded = decodeCollection(token);
    if (decoded) setPendingImport(decoded);
    else setImportError("That shared link is invalid or has been corrupted.");
  }, []);

  const persist = (next: ConversionCollection[]) => {
    setCollections(next);
    saveCollections(localStorage, next);
  };

  const customSymbols = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const unit of customUnits) (map[unit.dimension] ??= []).push(unit.symbol);
    return map;
  }, [customUnits]);

  const draftOptions = symbolsFor(draftCategory, customUnits);
  const draftFromOption = draftOptions.find((option) => option.symbol === draftFrom) ?? draftOptions[0];
  const draftToOption = draftOptions.find((option) => option.symbol === draftTo) ?? draftOptions[Math.min(1, draftOptions.length - 1)];

  const changeDraftCategory = (id: string) => {
    const next = symbolsFor(id, customUnits);
    setDraftCategory(id);
    setDraftFrom(next[0]?.symbol ?? "");
    setDraftTo(next[Math.min(1, next.length - 1)]?.symbol ?? "");
    setDraftError("");
  };

  const addDraftItem = () => {
    const config: ConversionConfig = {
      category: draftCategory,
      from: draftFromOption?.symbol ?? "",
      to: draftToOption?.symbol ?? "",
      ...(draftAmount.trim() ? { amount: draftAmount.trim() } : {}),
    };
    const issues = validateConversionConfig(config, customSymbols);
    if (issues.length) { setDraftError(issues[0]!); return; }
    setDraftItems((old) => [...old, config]);
    setDraftAmount("");
    setDraftError("");
  };

  const saveDraft = () => {
    const name = draftName.trim();
    if (!name) { setDraftError("Give your collection a name."); return; }
    if (draftItems.length === 0) { setDraftError("Add at least one conversion."); return; }
    persist([...collections, createCollection(name, draftDescription, draftItems)]);
    setDraftName("");
    setDraftDescription("");
    setDraftItems([]);
    setDraftError("");
    flash(`Saved "${name}".`);
  };

  const removeCollection = (collection: ConversionCollection) => {
    if (!window.confirm(`Delete "${collection.name}"?`)) return;
    persist(collections.filter((item) => item.id !== collection.id));
    flash(`Deleted "${collection.name}".`);
  };

  const acceptImport = (payload: SharedCollectionPayload) => {
    const collection = createCollection(payload.name, payload.description, payload.items);
    persist([...collections, collection]);
    setPendingImport(null);
    setImportToken("");
    const url = new URL(window.location.href);
    url.searchParams.delete("import");
    window.history.replaceState({}, "", url);
    flash(`Imported "${payload.name}".`);
  };

  const runTokenImport = () => {
    setImportError("");
    const decoded = decodeCollection(importToken.trim());
    if (!decoded) { setImportError("This does not look like a valid shared collection token."); return; }
    setPendingImport(decoded);
  };

  const shareCollection = async (collection: ConversionCollection) => {
    const token = encodeCollection(collection);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("import", token);
    try {
      await navigator.clipboard?.writeText(url.toString());
      flash("Share link copied to your clipboard.");
    } catch {
      setImportError("");
      flash("Copy the link manually: the clipboard is unavailable.");
    }
  };

  const exportCollection = (collection: ConversionCollection) => {
    downloadTextFile(`omni-collection-${collection.id}.json`, JSON.stringify({ name: collection.name, description: collection.description, items: collection.items }, null, 2), "application/json");
    flash(`Exported "${collection.name}".`);
  };

  const openItem = (item: ConversionConfig) => {
    const amount = item.amount ?? "1";
    setLocation(`/?category=${encodeURIComponent(item.category)}&amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
  };

  const computeItem = (item: ConversionConfig): { ok: boolean; text: string } => {
    if (item.category === "currency") return { ok: false, text: "Live rate" };
    const category = categoryById(item.category);
    if (!category) return { ok: false, text: "Unknown category" };
    const options = unitOptionsFor(category, customUnits);
    const from = options.find((option) => option.symbol === item.from);
    const to = options.find((option) => option.symbol === item.to);
    if (!from || !to) return { ok: false, text: "Unknown unit" };
    const amount = parseLocaleNumber(item.amount ?? "1");
    if (!amount.ok) return { ok: false, text: "Invalid amount" };
    if (category.id === "fuel" && amount.value <= 0) return { ok: false, text: "Out of range" };
    try {
      const value = convertBetweenOptions(category, amount.value, from, to);
      if (!Number.isFinite(value)) return { ok: false, text: "Not available" };
      return { ok: true, text: `${formatNumber(value, { digits: item.precision ?? 4, trimTrailingZeros: true })} ${to.symbol}` };
    } catch {
      return { ok: false, text: "Not available" };
    }
  };

  const renderCollection = (collection: ConversionCollection, builtin: boolean) => (
    <div key={collection.id} className="card-surface overflow-hidden rounded-[22px]" data-testid={`card-collection-${collection.id}`}>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{collection.name}</span>
            {builtin && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Preset</span>}
          </div>
          <p className="mb-0 mt-1 text-xs leading-5 text-muted-foreground">{collection.description || "No description"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={() => void shareCollection(collection)} data-testid={`button-share-collection-${collection.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold hover:bg-muted">
            <Share2 size={12} /> Share
          </button>
          <button onClick={() => exportCollection(collection)} data-testid={`button-export-collection-${collection.id}`} aria-label={`Export ${collection.name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted">
            <Download size={13} />
          </button>
          {!builtin && (
            <button onClick={() => removeCollection(collection)} data-testid={`button-delete-collection-${collection.id}`} aria-label={`Delete ${collection.name}`} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {collection.items.map((item, index) => {
          const result = computeItem(item);
          return (
            <div key={`${item.category}-${item.from}-${item.to}-${index}`} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <div className="min-w-0">
                <div className="text-xs font-semibold">{describeItem(item)}</div>
                {item.amount && <div className="mt-0.5 text-[11px] text-muted-foreground">Starts at {item.amount}</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`mono text-xs font-semibold ${result.ok ? "text-primary" : "text-muted-foreground"}`} data-testid={`text-collection-result-${collection.id}-${index}`}>{result.text}</span>
                <button onClick={() => openItem(item)} data-testid={`button-open-collection-${collection.id}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground hover:opacity-90">
                  Convert <ArrowRight size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="Collections"
        title="Your conversions, grouped and shareable."
        description="Start from a preset or build a set of your own. Share a collection with a link that carries settings only — never your data."
      />

      {notice && <p role="status" data-testid="status-collections-notice" className="mb-4 flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-3 text-xs text-primary"><Check size={13} />{notice}</p>}

      {pendingImport && (
        <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="panel-pending-import">
          <div className="flex items-center gap-2 text-sm font-bold text-primary"><Link2 size={15} /> Incoming shared collection</div>
          <p className="mb-3 mt-2 text-xs leading-5 text-muted-foreground">"{pendingImport.name}" with {pendingImport.items.length} conversion{pendingImport.items.length === 1 ? "" : "s"}. {pendingImport.description}</p>
          <div className="flex gap-2">
            <button onClick={() => acceptImport(pendingImport)} data-testid="button-accept-import" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">Add to my collections</button>
            <button onClick={() => setPendingImport(null)} data-testid="button-dismiss-import" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div>
            <h2 className="display-font mb-3 mt-0 flex items-center gap-2 text-base font-bold"><Layers size={16} className="text-primary" /> Built-in presets</h2>
            <div className="space-y-5">{builtInCollections.filter((collection) => collection.items.some((item) => item.category !== "currency" || CURRENCY_CODES.includes(item.from))).map((collection) => renderCollection(collection, true))}</div>
          </div>

          <div>
            <h2 className="display-font mb-3 mt-0 flex items-center gap-2 text-base font-bold"><Layers size={16} className="text-primary" /> My collections</h2>
            {collections.length === 0 ? (
              <div className="card-surface flex min-h-[160px] flex-col items-center justify-center rounded-[22px] px-6 text-center" data-testid="empty-collections">
                <p className="m-0 max-w-[360px] text-xs leading-5 text-muted-foreground">You haven't saved any collections yet. Build one on the right, or import a shared link.</p>
              </div>
            ) : (
              <div className="space-y-5">{collections.map((collection) => renderCollection(collection, false))}</div>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">New collection</div>
            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor="collection-name">Name</FieldLabel>
                <input id="collection-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={64} data-testid="input-collection-name" placeholder="Kitchen essentials" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <FieldLabel htmlFor="collection-description">Description</FieldLabel>
                <input id="collection-description" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={240} data-testid="input-collection-description" placeholder="Everyday cooking measures" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">Add a conversion</div>
              <div className="space-y-2">
                <Select label="Collection category" testId="select-collection-category" value={draftCategory} onChange={changeDraftCategory}>
                  <option value="currency">Currency</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <select aria-label="From unit" data-testid="select-collection-from" value={draftFromOption?.symbol ?? ""} onChange={(event) => setDraftFrom(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-xs font-semibold outline-none focus:border-primary">
                    {draftOptions.map((option) => <option key={option.symbol} value={option.symbol}>{option.symbol}</option>)}
                  </select>
                  <select aria-label="To unit" data-testid="select-collection-to" value={draftToOption?.symbol ?? ""} onChange={(event) => setDraftTo(event.target.value)} className="h-11 rounded-xl border border-input bg-background px-3 text-xs font-semibold outline-none focus:border-primary">
                    {draftOptions.map((option) => <option key={option.symbol} value={option.symbol}>{option.symbol}</option>)}
                  </select>
                </div>
                <input value={draftAmount} onChange={(event) => setDraftAmount(event.target.value)} inputMode="decimal" aria-label="Starting amount" data-testid="input-collection-amount" placeholder="Starting amount (optional)" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-primary" />
                <button onClick={addDraftItem} data-testid="button-add-collection-item" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted">
                  <Plus size={13} /> Add conversion
                </button>
              </div>
              {draftItems.length > 0 && (
                <ul className="mb-0 mt-3 space-y-1.5" data-testid="list-draft-items">
                  {draftItems.map((item, index) => (
                    <li key={`${item.category}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px]">
                      <span className="mono">{describeItem(item)}{item.amount ? ` (${item.amount})` : ""}</span>
                      <button onClick={() => setDraftItems((old) => old.filter((_, position) => position !== index))} aria-label="Remove conversion" data-testid={`button-remove-draft-${index}`} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {draftError && <p role="alert" className="mb-0 mt-3 text-[11px] text-destructive" data-testid="status-collection-error">{draftError}</p>}
            <button onClick={saveDraft} data-testid="button-save-collection" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground hover:opacity-90">
              <Layers size={14} /> Save collection
            </button>
          </div>

          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2"><Link2 size={15} className="text-primary" /><span className="text-sm font-bold">Import a shared collection</span></div>
            <input value={importToken} onChange={(event) => setImportToken(event.target.value)} placeholder="Paste a share token" data-testid="input-collection-token" className="mono h-11 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-primary" />
            <button onClick={runTokenImport} disabled={!importToken.trim()} data-testid="button-import-collection" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">
              <Download size={13} /> Decode token
            </button>
            {importError && <p role="alert" className="mb-0 mt-3 text-[11px] text-destructive" data-testid="status-import-error">{importError}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}
