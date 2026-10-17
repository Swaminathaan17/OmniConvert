import { type ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGetCurrencyRates } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell, FieldLabel, PageHeading, Select } from "@/components/layout";
import NotFound from "@/pages/not-found";
import { Route, Switch, useLocation, Link, Router as WouterRouter } from "wouter";
import { readStoredValue, writeStoredValue } from "@/lib/storage";
import { readStore, useStored } from "@/hooks/use-stored";
import {
  ArrowDownUp, ArrowLeftRight, ArrowRight, Check, ChevronDown, Clock3,
  Copy, Heart, History, Info, RotateCcw, Search, Settings2, Share2,
  Star, X, RefreshCw, CircleAlert, Ruler, Wand2, Keyboard,
} from "lucide-react";
import { categories, convert as convertUnits, getUnit, type Category } from "@/lib/units";
import {
  ROUNDING_MODES,
  ROUNDING_MODE_LABELS,
  formatNumber,
  parseLocaleNumber,
  type NumberNotation,
  type RoundingMode,
} from "@/lib/number-format";
import { tryEvaluateExpression } from "@/lib/expression";
import {
  convertBetweenOptions,
  loadCustomUnits,
  unitOptionsFor,
  type CustomUnit,
  type UnitOption,
} from "@/lib/custom-units";
import { decodeShareConfig } from "@/lib/collections";

const queryClient = new QueryClient();
const CATEGORY_STORAGE = "omni-category";
const PRECISION_STORAGE = "omni-precision";
const DISPLAY_MODE_STORAGE = "omni-display-mode";
const ROUNDING_STORAGE = "omni-rounding";
const NOTATION_STORAGE = "omni-notation";
const EXPRESSION_STORAGE = "omni-expression-mode";
const FAV_STORAGE = "omni-favorites";
const HISTORY_STORAGE = "omni-history";
const HISTORY_LIMIT_STORAGE = "omni-history-limit";
const HISTORY_LIMIT_OPTIONS = [10, 20, 35, 50, 100] as const;

const BatchPage = lazy(() => import("@/pages/batch"));
const CustomUnitsPage = lazy(() => import("@/pages/custom-units"));
const CollectionsPage = lazy(() => import("@/pages/collections"));

function normalizeHistoryLimit(value: number) {
  return HISTORY_LIMIT_OPTIONS.includes(value as (typeof HISTORY_LIMIT_OPTIONS)[number]) ? value : 35;
}

export const currencies = [
  ["INR", "Indian rupee"], ["USD", "US dollar"], ["EUR", "Euro"], ["GBP", "British pound"], ["JPY", "Japanese yen"],
  ["CNY", "Chinese yuan"], ["AED", "UAE dirham"], ["SAR", "Saudi riyal"], ["SGD", "Singapore dollar"], ["AUD", "Australian dollar"],
  ["CAD", "Canadian dollar"], ["CHF", "Swiss franc"], ["HKD", "Hong Kong dollar"], ["KRW", "South Korean won"], ["BDT", "Bangladeshi taka"],
] as const;
export type CurrencyCode = (typeof currencies)[number][0];
const currencyCode = (value: string | null, fallback: CurrencyCode): CurrencyCode =>
  currencies.some(([code]) => code === value) ? (value as CurrencyCode) : fallback;

export type RecordItem = { id: string; category: string; amount: string; from: string; to: string; result: string; created: number };

type DisplayMode = "decimals" | "significant";

interface DisplaySettings {
  mode: DisplayMode;
  precision: number;
  rounding: RoundingMode;
  notation: NumberNotation;
}

function formatWith(value: number, settings: DisplaySettings): string {
  return formatNumber(value, {
    digits: settings.precision,
    ...(settings.mode === "significant" ? { significantDigits: settings.precision } : {}),
    mode: settings.rounding,
    notation: settings.notation,
  });
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .trim().split(/\s+/).map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)).join(" ");
}

function useShortcuts(handlers: Record<string, () => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current.search?.();
      } else if (!typing && event.key === "/") {
        event.preventDefault();
        ref.current.search?.();
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        ref.current.swap?.();
      } else if (!typing && event.key.toLowerCase() === "s") {
        event.preventDefault();
        ref.current.swap?.();
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        ref.current.copy?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function UnitPage() {
  const params = new URLSearchParams(window.location.search);
  const shareParam = params.get("share");
  const shared = shareParam ? decodeShareConfig(shareParam) : null;
  const [customUnits] = useState<CustomUnit[]>(() => readStore<CustomUnit[]>("omni-custom-units", []).length ? loadCustomUnits(localStorage) : []);

  const initialCategory = (shared?.category ?? params.get("category") ?? "").trim();
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.id === initialCategory)?.id ?? readStore(CATEGORY_STORAGE, "length"),
  );
  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const options = useMemo(() => unitOptionsFor(category, customUnits), [category, customUnits]);
  const firstOption = options[0]!;
  const secondOption = options[Math.min(1, options.length - 1)] ?? firstOption;

  const [fromId, setFromId] = useState(() => {
    const wanted = shared?.from ?? params.get("from") ?? firstOption.id;
    return options.find((option) => option.symbol === wanted || option.id === wanted)?.id ?? firstOption.id;
  });
  const [toId, setToId] = useState(() => {
    const wanted = shared?.to ?? params.get("to") ?? secondOption.id;
    return options.find((option) => option.symbol === wanted || option.id === wanted)?.id ?? secondOption.id;
  });

  const fromOption = options.find((option) => option.id === fromId) ?? firstOption;
  const toOption = options.find((option) => option.id === toId) ?? secondOption;

  const [mode, setMode] = useStored<DisplayMode>(DISPLAY_MODE_STORAGE, "decimals");
  const [precision, setPrecision] = useStored(PRECISION_STORAGE, 4);
  const [rounding, setRounding] = useStored<RoundingMode>(ROUNDING_STORAGE, "half-up");
  const [notation, setNotation] = useStored<NumberNotation>(NOTATION_STORAGE, "auto");
  const [expressionMode, setExpressionMode] = useStored(EXPRESSION_STORAGE, false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const display: DisplaySettings = { mode, precision, rounding, notation };
  const formatResult = (value: number) => formatWith(value, display);

  const initialAmount = shared?.amount ?? params.get("amount") ?? "1";
  const [fromText, setFromText] = useState(initialAmount);
  const [toText, setToText] = useState("");
  const [activeSide, setActiveSide] = useState<"from" | "to">("from");

  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  const [showAll, setShowAll] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const parseUserText = (text: string) => {
    if (expressionMode) {
      const result = tryEvaluateExpression(text);
      return result.ok ? { ok: true, value: result.value } : { ok: false, value: Number.NaN, error: result.error };
    }
    return parseLocaleNumber(text);
  };

  const parsedFrom = parseUserText(fromText);
  const parsedTo = parseUserText(toText);
  const activeParsed = activeSide === "from" ? parsedFrom : parsedTo;
  const activeText = activeSide === "from" ? fromText : toText;

  const safeConvert = (value: number, from: UnitOption, to: UnitOption): number => {
    if (!Number.isFinite(value)) return Number.NaN;
    if (category.id === "fuel" && value <= 0) return Number.NaN;
    try {
      return convertBetweenOptions(category, value, from, to, { allowNonFiniteResult: true });
    } catch {
      return Number.NaN;
    }
  };

  const fromValue = activeSide === "from"
    ? parsedFrom.value
    : safeConvert(parsedTo.value, toOption, fromOption);
  const toValue = activeSide === "from"
    ? safeConvert(parsedFrom.value, fromOption, toOption)
    : parsedTo.value;

  const rangeInvalid = activeParsed.ok && category.id === "fuel" && activeParsed.value <= 0;
  const valid = activeParsed.ok && Number.isFinite(fromValue) && Number.isFinite(toValue) && !rangeInvalid;
  const inputError = !activeParsed.ok
    ? activeParsed.error
    : rangeInvalid
      ? "Fuel economy values must be greater than zero."
      : !valid
        ? "This value cannot be converted for the selected units."
        : "";

  const normalizedSearch = normalizeSearch(search);
  const visibleCategories = categories.filter((item) =>
    normalizeSearch(`${item.name} ${item.id} ${item.units.map((u) => `${u.name} ${u.symbol}`).join(" ")}`).includes(normalizedSearch),
  );
  const matchingUnits = normalizedSearch
    ? categories.flatMap((item) =>
        item.units
          .filter((u) => normalizeSearch(`${u.name} ${u.symbol} ${item.name}`).includes(normalizedSearch))
          .map((u) => ({ ...u, category: item })),
      ).slice(0, 7)
    : [];

  useEffect(() => {
    try { localStorage.setItem(CATEGORY_STORAGE, JSON.stringify(categoryId)); } catch { /* storage blocked */ }
  }, [categoryId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    url.searchParams.set("category", categoryId);
    url.searchParams.set("amount", valid ? String(fromValue) : fromText);
    url.searchParams.set("from", fromOption.symbol);
    url.searchParams.set("to", toOption.symbol);
    window.history.replaceState({}, "", url);
  }, [categoryId, fromText, fromValue, fromOption.symbol, toOption.symbol, valid]);

  useEffect(() => {
    if (!valid) return;
    const timeout = window.setTimeout(() => setHistory((old) => [
      { id: `${Date.now()}`, category: categoryId, amount: String(fromValue), from: fromOption.symbol, to: toOption.symbol, result: String(toValue), created: Date.now() },
      ...old.filter((item) => !(item.category === categoryId && item.amount === String(fromValue) && item.from === fromOption.symbol && item.to === toOption.symbol)),
    ].slice(0, historyLimit)), 400);
    return () => window.clearTimeout(timeout);
  }, [categoryId, fromValue, toValue, fromOption.symbol, toOption.symbol, valid, historyLimit, setHistory]);

  const changeCategory = (id: string) => {
    const next = categories.find((item) => item.id === id) ?? categories[0];
    const nextOptions = unitOptionsFor(next, customUnits);
    setCategoryId(next.id);
    setFromId(nextOptions[0]!.id);
    setToId(nextOptions[Math.min(1, nextOptions.length - 1)]!.id);
    setActiveSide("from");
    setSearch("");
  };

  const swap = () => {
    setFromId(toOption.id);
    setToId(fromOption.id);
    setActiveSide("from");
    setFromText(valid ? String(toValue) : fromText);
  };

  const copyResult = async () => {
    if (!valid) return;
    try {
      await navigator.clipboard?.writeText(String(toValue));
      setCopied("result");
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  const saveFavorite = () => {
    const item: RecordItem = { id: `${categoryId}:${fromOption.symbol}:${toOption.symbol}`, category: categoryId, amount: String(fromValue), from: fromOption.symbol, to: toOption.symbol, result: String(toValue), created: Date.now() };
    setFavorites((old) => (old.some((f) => f.id === item.id) ? old.filter((f) => f.id !== item.id) : [item, ...old]));
  };
  const isFavorite = favorites.some((f) => f.id === `${categoryId}:${fromOption.symbol}:${toOption.symbol}`);

  const copyShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    try {
      await navigator.clipboard?.writeText(url.toString());
      setCopied("share");
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  useShortcuts({
    search: () => searchInputRef.current?.focus(),
    swap,
    copy: () => void copyResult(),
  });

  const ratio = fromOption.model.scale / toOption.model.scale;
  const equivalents = options.filter((option) => option.id !== fromOption.id);

  const toShown = activeSide === "to" ? toText : valid ? formatResult(toValue) : "";
  const fromShown = activeSide === "from" ? fromText : valid ? formatResult(fromValue) : "";

  return (
    <>
      <PageHeading
        eyebrow="The everyday converter"
        title="Make the units make sense."
        description="Convert across 22 measurement categories, plus your own custom units. Everything runs on your device."
        aside={
          <button onClick={copyShare} data-testid="button-share-conversion" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted">
            <Share2 size={15} />{copied === "share" ? "Link copied" : "Share conversion"}
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card-surface overflow-hidden rounded-[22px]">
          <div className="flex flex-col gap-4 border-b border-border px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">01 / Pick a measure</div>
              <div className="mt-1 text-sm font-bold">What are we converting?</div>
            </div>
            <div className="relative w-full md:max-w-[300px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find category or unit…"
                aria-label="Search categories and units"
                data-testid="input-search-units"
                className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-xs outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
              />
              {matchingUnits.length > 0 && (
                <div className="absolute left-0 right-0 top-[46px] z-10 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl">
                  {matchingUnits.map((match) => (
                    <button
                      key={`${match.category.id}-${match.symbol}`}
                      onClick={() => {
                        changeCategory(match.category.id);
                        const nextOptions = unitOptionsFor(match.category, customUnits);
                        setFromId(nextOptions.find((option) => option.symbol === match.symbol)?.id ?? nextOptions[0]!.id);
                        setToId(nextOptions.find((option) => option.symbol !== match.symbol)?.id ?? nextOptions[0]!.id);
                        setSearch("");
                      }}
                      data-testid={`button-search-unit-${match.category.id}-${match.symbol}`}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                    >
                      <span className="text-xs font-semibold">{match.name} <span className="mono text-muted-foreground">({match.symbol})</span></span>
                      <span className="text-[10px] text-muted-foreground">{match.category.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3 md:px-7" role="group" aria-label="Unit categories">
            {visibleCategories.map((item) => (
              <button
                key={item.id}
                aria-pressed={categoryId === item.id}
                onClick={() => changeCategory(item.id)}
                data-testid={`tab-category-${item.id}`}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${categoryId === item.id ? "bg-primary text-primary-foreground" : "bg-muted/65 text-muted-foreground hover:text-foreground"}`}
              >
                {item.name}
              </button>
            ))}
            {!visibleCategories.length && <span className="py-2 text-xs text-muted-foreground">No matching category or unit.</span>}
          </div>
          <div className="p-5 md:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/25 text-lg font-semibold text-foreground">{category.icon}</span>
              <div>
                <div className="text-sm font-bold">{category.name}</div>
                <div className="text-[11px] text-muted-foreground">{options.length} units available</div>
              </div>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">02 / Set your values</span>
            </div>
            <div className="grid items-end gap-3 md:grid-cols-[1fr_42px_1fr]">
              <div>
                <FieldLabel>From</FieldLabel>
                <Select label="Convert from unit" testId="select-from-unit" value={fromOption.id} onChange={(value) => { setFromId(value); setActiveSide("from"); }}>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.symbol}){option.source === "custom" ? " · custom" : ""}</option>)}
                </Select>
                <input
                  inputMode={expressionMode ? "text" : "decimal"}
                  type={expressionMode ? "text" : "number"}
                  value={fromShown}
                  onChange={(e) => { setActiveSide("from"); setFromText(e.target.value); }}
                  aria-label="Amount to convert"
                  aria-invalid={activeSide === "from" && !activeParsed.ok}
                  data-testid="input-amount"
                  className="mono mt-3 h-[68px] w-full rounded-xl border border-input bg-background px-4 text-[25px] font-medium outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/10"
                  placeholder={expressionMode ? "e.g. 12 * 3.5" : "Enter amount"}
                />
              </div>
              <button onClick={swap} aria-label="Swap units" title="Swap units (S)" data-testid="button-swap-units" className="mb-2 grid h-10 w-10 place-items-center justify-self-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowDownUp size={17} />
              </button>
              <div>
                <FieldLabel>To</FieldLabel>
                <Select label="Convert to unit" testId="select-to-unit" value={toOption.id} onChange={(value) => { setToId(value); setActiveSide("from"); }}>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.symbol}){option.source === "custom" ? " · custom" : ""}</option>)}
                </Select>
                <input
                  inputMode={expressionMode ? "text" : "decimal"}
                  type={expressionMode ? "text" : "number"}
                  value={toShown}
                  onChange={(e) => { setActiveSide("to"); setToText(e.target.value); }}
                  aria-label="Converted result, editable for two-way conversion"
                  aria-invalid={activeSide === "to" && !activeParsed.ok}
                  data-testid="text-conversion-result"
                  className="mono mt-3 h-[68px] w-full rounded-xl border border-primary/25 bg-primary/[.045] px-4 text-[25px] font-semibold text-primary outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                  placeholder="Result"
                />
              </div>
            </div>
            <div role="alert" aria-live="polite" data-testid="status-validation" className={`mt-3 flex items-center gap-2 text-xs ${inputError ? "text-destructive" : "text-muted-foreground"}`}>
              {inputError ? <CircleAlert size={14} /> : valid ? <Check size={14} className="text-primary" /> : null}
              <span>{inputError || (valid ? `${fromShown || fromText} ${fromOption.symbol} = ${formatResult(toValue)} ${toOption.symbol}` : "Enter a value to convert.")}</span>
            </div>
            {expressionMode && (
              <p className="mb-0 mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Wand2 size={13} /> Expression mode accepts + − × ÷ ^ %, parentheses, and functions like sqrt(144).
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted"><Settings2 size={14} /></span>
                  <label htmlFor="precision" className="font-medium">{mode === "significant" ? "Significant figures" : "Decimal places"}</label>
                  <select id="precision" value={precision} onChange={(e) => setPrecision(Number(e.target.value))} data-testid="select-precision" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-semibold text-foreground">
                    {(mode === "significant" ? [1, 2, 3, 4, 5, 6, 8] : [2, 3, 4, 5, 6, 8, 10]).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  data-testid="button-toggle-advanced"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"
                >
                  <Wand2 size={12} /> Advanced input & rounding
                  <ChevronDown size={12} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={saveFavorite} disabled={!valid} data-testid="button-toggle-favorite" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${isFavorite ? "border-accent bg-accent/20 text-foreground" : "border-border hover:bg-muted"}`}>
                  <Star size={14} fill={isFavorite ? "currentColor" : "none"} />{isFavorite ? "Pinned" : "Pin conversion"}
                </button>
                <button onClick={copyResult} disabled={!valid} data-testid="button-copy-result" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40">
                  {copied === "result" ? <Check size={14} /> : <Copy size={14} />}{copied === "result" ? "Copied" : "Copy result"}
                </button>
                <button onClick={() => { setFromText("1"); setActiveSide("from"); setSearch(""); }} data-testid="button-reset-conversion" aria-label="Reset conversion" className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>
            {showAdvanced && (
              <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3" data-testid="panel-advanced">
                <label className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span>Expression mode</span>
                  <input type="checkbox" checked={expressionMode} onChange={(e) => setExpressionMode(e.target.checked)} data-testid="checkbox-expression-mode" className="h-4 w-8 appearance-none rounded-full bg-border transition-colors checked:bg-primary relative after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-4" />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  <span>Display</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value as DisplayMode)} data-testid="select-display-mode" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
                    <option value="decimals">Fixed decimals</option>
                    <option value="significant">Significant figures</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  <span>Rounding</span>
                  <select value={rounding} onChange={(e) => setRounding(e.target.value as RoundingMode)} data-testid="select-rounding" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
                    {ROUNDING_MODES.map((value) => <option key={value} value={value}>{ROUNDING_MODE_LABELS[value]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  <span>Notation</span>
                  <select value={notation} onChange={(e) => setNotation(e.target.value as NumberNotation)} data-testid="select-notation" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
                    <option value="auto">Automatic</option>
                    <option value="decimal">Plain decimal</option>
                    <option value="scientific">Scientific</option>
                    <option value="engineering">Engineering</option>
                    <option value="compact">Compact (1.2M)</option>
                  </select>
                </label>
                <div className="sm:col-span-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Keyboard size={13} /> Shortcuts: <kbd className="rounded border border-border bg-background px-1.5">/</kbd> search ·
                  <kbd className="rounded border border-border bg-background px-1.5">S</kbd> swap ·
                  <kbd className="rounded border border-border bg-background px-1.5">⌘/Ctrl</kbd>+<kbd className="rounded border border-border bg-background px-1.5">⇧</kbd>+<kbd className="rounded border border-border bg-background px-1.5">C</kbd> copy
                </div>
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-5">
          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">The working</div>
                <div className="mt-1 text-sm font-bold">Conversion, explained</div>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/25"><Info size={15} /></span>
            </div>
            <div className="rounded-xl bg-muted/70 p-4">
              <div className="mono text-[11px] text-muted-foreground">
                {category.temperature ? "Temperature scale relation" : `1 ${fromOption.symbol} = ${valid ? formatResult(safeConvert(1, fromOption, toOption)) : "—"} ${toOption.symbol}`}
              </div>
              <div className="mono mt-2 break-words text-sm font-semibold">
                {category.temperature || category.id === "fuel"
                  ? `${fromShown || "x"} ${fromOption.symbol} → ${valid ? formatResult(toValue) : "—"} ${toOption.symbol}`
                  : `${fromShown || "x"} × ${formatResult(ratio)} = ${valid ? formatResult(toValue) : "—"}`}
              </div>
            </div>
            <p className="mb-0 mt-4 text-xs leading-5 text-muted-foreground">
              {category.temperature
                ? "Temperature uses an offset scale, so it cannot be converted with a simple multiplier."
                : category.id === "fuel"
                  ? "Fuel economy is an inverse relationship: higher distance per liter means fewer liters per 100 kilometers."
                  : `We multiply your value by the ${fromOption.name.toLowerCase()} to ${toOption.name.toLowerCase()} ratio. The result is rounded using the ${ROUNDING_MODE_LABELS[rounding].toLowerCase()} rule.`}
              {category.assumption ? ` ${category.assumption}` : ""}
            </p>
            {fromOption.source === "custom" || toOption.source === "custom" ? (
              <p className="mb-0 mt-3 rounded-lg bg-accent/15 px-3 py-2 text-[11px] leading-5">A custom unit is involved in this conversion. It is validated and stored on this device.</p>
            ) : null}
          </div>
          <div className="rounded-[22px] bg-[#173d3a] p-5 text-[#eef4e8] md:p-6">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#b5c9b7]">Quick reference</div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px]">{category.name}</span>
            </div>
            <div className="mt-5 space-y-3">
              {options.slice(0, 4).map((option) => (
                <div key={option.id} className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0">
                  <span className="text-xs text-[#c8d7cd]">{option.name}</span>
                  <span className="mono text-xs font-medium">{formatResult(safeConvert(valid ? fromValue : 1, fromOption, option))} {option.symbol}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <section className="mt-6">
        <button onClick={() => setShowAll((value) => !value)} aria-expanded={showAll} data-testid="button-toggle-all-units" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted">
          {showAll ? "Hide all equivalents" : `See all ${Math.max(0, equivalents.length)} equivalents`}
          <ChevronDown size={14} className={`transition-transform ${showAll ? "rotate-180" : ""}`} />
        </button>
        {showAll && (
          <div className="card-surface mt-3 grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 xl:grid-cols-3" data-testid="list-all-unit-equivalents">
            {equivalents.map((option) => (
              <div key={option.id} className="flex min-w-0 items-center justify-between gap-4 bg-card px-4 py-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{option.name}</span>
                  <span className="mono text-[10px] text-muted-foreground">{option.symbol}{option.source === "custom" ? " · custom" : ""}</span>
                </span>
                <span className="mono text-right text-sm font-semibold text-primary" data-testid={`text-equivalent-${option.symbol}`}>
                  {valid ? formatResult(safeConvert(fromValue, fromOption, option)) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">Your recent work</div>
            <h2 className="display-font mb-0 mt-1 text-lg font-bold tracking-tight">Back to what you were converting</h2>
          </div>
          <Link href="/history" className="inline-flex items-center gap-1 text-xs font-bold text-primary no-underline hover:underline" data-testid="link-view-history">View history <ArrowRight size={14} /></Link>
        </div>
        {history.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {history.slice(0, 3).map((item) => (
              <RepeatHistoryCard key={item.id} item={item} onRepeat={(next) => { handleRepeat(next, setCategoryId, setFromText, setActiveSide, setFromId, setToId, customUnits); }} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Your recent conversions will show up here.</div>
        )}
      </section>
    </>
  );
}

function RepeatHistoryCard({ item, onRepeat }: { item: RecordItem; onRepeat: (item: RecordItem) => void }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => {
        if (item.category === "currency") {
          setLocation(`/currency?category=currency&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
          return;
        }
        onRepeat(item);
      }}
      data-testid={`button-repeat-recent-${item.id}`}
      className="card-surface flex items-center justify-between rounded-xl px-4 py-3 text-left hover:border-primary/40"
    >
      <span>
        <span className="block text-[11px] text-muted-foreground">{item.category === "currency" ? "Currency" : categories.find((c) => c.id === item.category)?.name ?? item.category}</span>
        <span className="mono mt-1 block text-sm font-semibold">{item.amount} {item.from} <ArrowRight className="mx-1 inline" size={12} /> {formatNumber(Number(item.result), { digits: 4 })} {item.to}</span>
      </span>
      <Clock3 size={15} className="text-muted-foreground" />
    </button>
  );
}

function handleRepeat(
  item: RecordItem,
  setCategoryId: (id: string) => void,
  setFromText: (value: string) => void,
  setActiveSide: (side: "from" | "to") => void,
  setFromId: (id: string) => void,
  setToId: (id: string) => void,
  customUnits: CustomUnit[],
) {
  const category = categories.find((c) => c.id === item.category) ?? categories[0];
  const options = unitOptionsFor(category, customUnits);
  setCategoryId(category.id);
  setFromText(item.amount);
  setActiveSide("from");
  setFromId(options.find((option) => option.symbol === item.from)?.id ?? options[0]!.id);
  setToId(options.find((option) => option.symbol === item.to)?.id ?? options[Math.min(1, options.length - 1)]!.id);
}

function CurrencyPage() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialBase = currencyCode(initialParams.get("base") ?? initialParams.get("from"), "USD");
  const initialTarget = currencyCode(initialParams.get("target") ?? initialParams.get("to"), "EUR");
  const [base, setBase] = useState<CurrencyCode>(initialBase);
  const [target, setTarget] = useState<CurrencyCode>(
    initialTarget === initialBase ? currencies.find(([code]) => code !== initialBase)?.[0] ?? "EUR" : initialTarget,
  );
  const [manualRefresh, setManualRefresh] = useState(false);
  const [amount, setAmount] = useState(initialParams.get("amount") ?? "100");
  const [precision] = useStored(PRECISION_STORAGE, 4);
  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [copied, setCopied] = useState(false);
  const queryParams = { base, ...(manualRefresh ? { refresh: "1" as const } : {}) };
  const query = useGetCurrencyRates(queryParams, { query: { queryKey: ["/api/currency/rates", queryParams], refetchOnWindowFocus: true, staleTime: 60_000 } });
  const data = query.data;
  const rate = data?.rates?.[target];
  const parsedAmount = parseLocaleNumber(amount);
  const validAmount = parsedAmount.ok;
  const currencyDigits = (code: string) => { try { return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; } catch { return 2; } };
  const output = validAmount && typeof rate === "number" ? parsedAmount.value * rate : Number.NaN;
  const fmt = (value: number, code: string) => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: currencyDigits(code), minimumFractionDigits: currencyDigits(code) }).format(value) : "—";
  const rateText = typeof rate === "number" ? `1 ${base} = ${formatNumber(rate, { digits: 6 })} ${target}` : "";
  const updateTime = data?.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const favoriteId = `currency:${base}:${target}`;
  const isFavorite = favorites.some((item) => item.id === favoriteId);
  const currencySymbol = (code: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((part) => part.type === "currency")?.value ?? code;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("category", "currency");
    url.searchParams.set("amount", amount);
    url.searchParams.set("from", base);
    url.searchParams.set("to", target);
    window.history.replaceState({}, "", url);
  }, [base, target, amount]);

  useEffect(() => {
    if (!validAmount || !Number.isFinite(output) || typeof rate !== "number") return;
    const timeout = window.setTimeout(() => {
      setHistory((old) => [
        { id: `currency:${Date.now()}`, category: "currency", amount, from: base, to: target, result: String(output), created: Date.now() },
        ...old.filter((entry) => !(entry.category === "currency" && entry.amount === amount && entry.from === base && entry.to === target)),
      ].slice(0, historyLimit));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [amount, base, output, rate, setHistory, target, validAmount, historyLimit]);

  const toggleFavorite = () => {
    const item: RecordItem = { id: favoriteId, category: "currency", amount: validAmount ? amount : "1", from: base, to: target, result: String(output), created: Date.now() };
    setFavorites((old) => (old.some((entry) => entry.id === favoriteId) ? old.filter((entry) => entry.id !== favoriteId) : [item, ...old]));
  };
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const sharePair = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("category", "currency");
    url.searchParams.set("amount", amount);
    url.searchParams.set("from", base);
    url.searchParams.set("to", target);
    void copyText(url.toString());
  };
  return (
    <>
      <PageHeading
        eyebrow="Live currency"
        title="A clearer view of exchange."
        description="Current provider rates for 15 currencies. Useful for planning; your bank may use a different rate."
        aside={
          <div className="flex flex-wrap gap-2">
            <button onClick={sharePair} data-testid="button-share-currency" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold"><Share2 size={14} />{copied ? "Link copied" : "Share pair"}</button>
            <button onClick={() => { if (manualRefresh) void query.refetch(); else setManualRefresh(true); }} disabled={query.isFetching} data-testid="button-refresh-rates" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />{query.isFetching ? "Updating" : "Refresh rates"}</button>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card-surface overflow-hidden rounded-[22px]">
          <div className="border-b border-border bg-secondary/45 px-5 py-5 md:px-7">
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Rate desk / Today</div>
            <div className="mt-1 text-sm font-bold">Convert with a live reference rate</div>
          </div>
          <div className="p-5 md:p-7">
            <div className="grid items-end gap-3 md:grid-cols-[1fr_42px_1fr]">
              <div>
                <FieldLabel>You have</FieldLabel>
                <Select label="Base currency" testId="select-base-currency" value={base} onChange={(code) => { const next = code as CurrencyCode; setBase(next); setManualRefresh(false); if (target === next) setTarget(currencies.find(([candidate]) => candidate !== next)?.[0] ?? "USD"); }}>
                  {currencies.map(([code, name]) => <option key={code} value={code}>{code} · {currencySymbol(code)} · {name}</option>)}
                </Select>
                <input inputMode="decimal" type="text" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to convert" data-testid="input-currency-amount" className="mono mt-3 h-[68px] w-full rounded-xl border border-input bg-background px-4 text-[25px] font-medium outline-none focus:border-primary" />
              </div>
              <button onClick={() => { setBase(target); setTarget(base); setManualRefresh(false); }} aria-label="Swap currencies" data-testid="button-swap-currencies" className="mb-2 grid h-10 w-10 place-items-center justify-self-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"><ArrowLeftRight size={17} /></button>
              <div>
                <FieldLabel>You get</FieldLabel>
                <Select label="Target currency" testId="select-target-currency" value={target} onChange={(code) => setTarget(code as CurrencyCode)}>
                  {currencies.filter(([code]) => code !== base).map(([code, name]) => <option key={code} value={code}>{code} · {currencySymbol(code)} · {name}</option>)}
                </Select>
                <div className="mono mt-3 flex h-[68px] items-center rounded-xl border border-primary/25 bg-primary/[.045] px-4 text-[25px] font-bold text-primary" data-testid="text-currency-result" aria-live="polite">
                  {query.isLoading ? <span className="h-7 w-36 animate-pulse rounded bg-primary/15" /> : fmt(output, target)}
                </div>
              </div>
            </div>
            {!validAmount && <p role="alert" data-testid="status-currency-validation" className="mt-3 text-xs text-destructive">Enter a valid finite amount.</p>}
            {query.isError && (
              <div role="alert" data-testid="status-rates-error" className="mt-5 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <CircleAlert size={17} className="mt-0.5 shrink-0 text-destructive" />
                  <div>
                    <div className="text-sm font-semibold">Rates aren’t available right now</div>
                    <p className="mb-0 mt-1 text-xs text-muted-foreground">Check your connection and try again. No placeholder rates are shown.</p>
                  </div>
                </div>
                <button onClick={() => { if (manualRefresh) void query.refetch(); else setManualRefresh(true); }} data-testid="button-retry-rates" className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">Try again</button>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={toggleFavorite} disabled={!Number.isFinite(output)} data-testid="button-toggle-currency-favorite" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${isFavorite ? "border-accent bg-accent/20 text-foreground" : "border-border hover:bg-muted"}`}><Star size={14} fill={isFavorite ? "currentColor" : "none"} />{isFavorite ? "Pair pinned" : "Pin currency pair"}</button>
              <button onClick={() => void copyText(String(output))} disabled={!Number.isFinite(output)} data-testid="button-copy-currency-result" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40">{copied ? <Check size={14} /> : <Copy size={14} />}Copy result</button>
            </div>
            {!query.isLoading && data && (
              <div className="mt-6 border-t border-border pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Exchange rate used</div>
                    <div className="mono mt-1 text-sm font-semibold" data-testid="text-exchange-rate">{rateText || "Rate unavailable for this pair"}</div>
                  </div>
                  <span data-testid="status-rate-freshness" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${data.stale ? "bg-accent/20 text-foreground" : "bg-primary/10 text-primary"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${data.stale ? "bg-accent" : "bg-primary"}`} />{data.stale ? "Cached rate" : "Provider rate"}
                  </span>
                </div>
                {data.stale && <p className="mb-0 mt-3 rounded-lg bg-accent/15 px-3 py-2 text-xs leading-5" data-testid="text-stale-disclosure">This is a cached rate and may not reflect the latest market. Refresh to check for a newer update.</p>}
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-5">
          <div className="card-surface rounded-[22px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Rate status</div>
                <div className="mt-1 text-sm font-bold">Source & timing</div>
              </div>
              <Clock3 size={17} className="text-primary" />
            </div>
            {query.isLoading && <div className="space-y-3" data-testid="status-rates-loading"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /></div>}
            {!query.isLoading && data && (
              <dl className="m-0 space-y-4 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Provider</dt><dd className="m-0 max-w-[150px] text-right font-semibold" data-testid="text-rate-provider">{data.provider}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last updated</dt><dd className="m-0 text-right font-semibold" data-testid="text-rate-updated">{updateTime ?? "Not supplied"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Fetched</dt><dd className="m-0 text-right font-semibold">{data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : "Just now"}</dd></div>
              </dl>
            )}
            {!query.isLoading && query.isError && <p className="mb-0 text-xs leading-5 text-muted-foreground">The rate feed could not be reached. No estimated or placeholder rates are shown.</p>}
          </div>
          <div className="rounded-[22px] bg-[#173d3a] p-5 text-[#eef4e8] md:p-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#b5c9b7]"><Info size={14} />A practical note</div>
            <p className="mb-0 mt-4 text-sm leading-6">These are provider reference rates, not a quote. Banks, card networks and money-transfer services may add fees or use their own rates.</p>
            <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-[#bdcec1]">Historical charting is not available from the selected rate provider.</div>
          </div>
        </aside>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {currencies.filter(([code]) => code !== base).slice(0, 7).map(([code, name]) => (
          <button key={code} onClick={() => setTarget(code)} data-testid={`button-shortcut-currency-${code}`} className={`rounded-full border px-3 py-2 text-[11px] font-semibold ${target === code ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{code} <span className="font-normal opacity-70">{name}</span></button>
        ))}
      </div>
    </>
  );
}

function CollectionPage({ mode }: { mode: "favorites" | "history" }) {
  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit, setHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [, setLocation] = useLocation();
  const items = mode === "favorites" ? favorites : history;
  const setItems = mode === "favorites" ? setFavorites : setHistory;
  const isFavorites = mode === "favorites";
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (history.length > historyLimit) setHistory((old) => old.slice(0, historyLimit));
  }, [history.length, historyLimit, setHistory]);

  const repeat = (item: RecordItem) => {
    if (item.category === "currency") {
      setLocation(`/currency?category=currency&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
      return;
    }
    setLocation(`/?category=${encodeURIComponent(item.category)}&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
  };
  const remove = (item: RecordItem) => setItems((old) => old.filter((entry) => entry.id !== item.id));
  const clear = () => { setItems([]); setNotice(isFavorites ? "All pinned conversions removed." : "Recent conversions cleared."); window.setTimeout(() => setNotice(""), 2800); };

  const actions = isFavorites
    ? items.length > 0
      ? <button onClick={clear} data-testid="button-clear-favorites" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive"><Trash2Icon />Remove all</button>
      : null
    : (
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium">
          Keep
          <select aria-label="Maximum recent conversions" value={historyLimit} onChange={(event) => setHistoryLimit(Number(event.target.value))} data-testid="select-history-limit" className="bg-transparent font-semibold outline-none">
            {HISTORY_LIMIT_OPTIONS.map((limit) => <option key={limit} value={limit}>{limit}</option>)}
          </select>
          recent
        </label>
        {items.length > 0 && <button onClick={clear} data-testid="button-clear-history" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive"><Trash2Icon />Clear history</button>}
      </div>
    );

  return (
    <>
      <PageHeading
        eyebrow={isFavorites ? "Saved for later" : "Your trail"}
        title={isFavorites ? "Your pinned conversions." : "A little history."}
        description={isFavorites ? "Keep the pairs you reach for close. Your pins stay on this device." : "Recent conversions are ready to repeat, whenever you need them again."}
        aside={actions}
      />
      {notice && <div role="status" className="mb-4 rounded-lg bg-primary/10 px-4 py-3 text-xs text-primary" data-testid="status-collection-cleared">{notice}</div>}
      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <article key={item.id} className="card-surface soft-in flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:p-5" data-testid={`card-${mode}-${item.id}`}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-lg font-semibold text-primary">{isFavorites ? <Star size={18} /> : <span className="mono text-xs">{String(index + 1).padStart(2, "0")}</span>}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">{item.category === "currency" ? "Currency" : categories.find((c) => c.id === item.category)?.name ?? item.category}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(item.created).toLocaleDateString()}</span>
                </div>
                <div className="mono flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span>{item.amount} {item.from}</span>
                  <ArrowRight size={14} className="text-primary" />
                  <span className="text-primary">{Number.isFinite(Number(item.result)) ? formatNumber(Number(item.result), { digits: readStore(PRECISION_STORAGE, 4) }) : "—"} {item.to}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => repeat(item)} data-testid={`button-repeat-${mode}-${item.id}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><RotateCcw size={13} />Convert again</button>
                <button aria-label="Remove conversion" onClick={() => remove(item)} data-testid={`button-remove-${mode}-${item.id}`} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"><X size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card-surface quiet-grid flex min-h-[330px] flex-col items-center justify-center rounded-[24px] px-6 text-center" data-testid={`empty-${mode}`}>
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">{isFavorites ? <Heart size={24} /> : <History size={24} />}</div>
          <div className="display-font text-xl font-bold">{isFavorites ? "Nothing pinned just yet." : "A fresh start."}</div>
          <p className="mb-5 mt-2 max-w-[350px] text-sm leading-6 text-muted-foreground">{isFavorites ? "When a conversion becomes a regular, pin it from the converter and it’ll be waiting here." : "Conversions you make are kept on this device, ready to use again."}</p>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground no-underline" data-testid="link-empty-convert">Open the converter <ArrowRight size={14} /></Link>
        </div>
      )}
    </>
  );
}

function Trash2Icon() {
  return <X size={14} />;
}

function LoadingPage() {
  return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground" role="status">Loading workspace…</div>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <AppShell>
        <Suspense fallback={<LoadingPage />}>
          <Switch>
            <Route path="/" component={UnitPage} />
            <Route path="/currency" component={CurrencyPage} />
            <Route path="/batch" component={BatchPage} />
            <Route path="/units" component={CustomUnitsPage} />
            <Route path="/collections" component={CollectionsPage} />
            <Route path="/favorites"><CollectionPage mode="favorites" /></Route>
            <Route path="/history"><CollectionPage mode="history" /></Route>
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
