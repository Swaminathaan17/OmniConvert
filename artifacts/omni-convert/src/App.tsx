import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGetCurrencyRates } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Link, Router as WouterRouter } from 'wouter';
import { readStoredValue, writeStoredValue } from '@/lib/storage';
import {
  ArrowDownUp, ArrowLeftRight, ArrowRight, Check, ChevronDown, Clock3,
  Compass, Copy, Heart, History, Menu, Moon, RotateCcw, Search, Settings2, Share2,
  Star, Sun, X, RefreshCw, CircleAlert, Info, Ruler, WalletCards, Trash2,
} from 'lucide-react';
import { categories, convert } from '@/lib/units';

const queryClient = new QueryClient();
const CATEGORY_STORAGE = 'omni-category';
const PRECISION_STORAGE = 'omni-precision';
const FAV_STORAGE = 'omni-favorites';
const HISTORY_STORAGE = 'omni-history';
const HISTORY_LIMIT_STORAGE = 'omni-history-limit';
const HISTORY_LIMIT_OPTIONS = [10, 20, 35, 50, 100] as const;
function normalizeHistoryLimit(value: number) {
  return HISTORY_LIMIT_OPTIONS.includes(value as typeof HISTORY_LIMIT_OPTIONS[number]) ? value : 35;
}
const currencies = [
  ['INR', 'Indian rupee'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['JPY', 'Japanese yen'],
  ['CNY', 'Chinese yuan'], ['AED', 'UAE dirham'], ['SAR', 'Saudi riyal'], ['SGD', 'Singapore dollar'], ['AUD', 'Australian dollar'],
  ['CAD', 'Canadian dollar'], ['CHF', 'Swiss franc'], ['HKD', 'Hong Kong dollar'], ['KRW', 'South Korean won'], ['BDT', 'Bangladeshi taka'],
] as const;
type CurrencyCode = (typeof currencies)[number][0];
const currencyCode = (value: string | null, fallback: CurrencyCode): CurrencyCode =>
  currencies.some(([code]) => code === value) ? (value as CurrencyCode) : fallback;


type RecordItem = { id: string; category: string; amount: string; from: string; to: string; result: string; created: number };
function readStore<T>(key: string, fallback: T): T {
  try { return readStoredValue(localStorage, key, fallback); } catch { return fallback; }
}
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStore(key, initial));
  useEffect(() => { try { writeStoredValue(localStorage, key, value); } catch { /* Keep the current session usable if storage is blocked. */ } }, [key, value]);
  return [value, setValue] as const;
}
function normalizeSearch(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .trim().split(/\s+/).map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word).join(' ');
}
function nice(value: number, precision: number) {
  if (!Number.isFinite(value)) return '—';
  const digits = Number.isInteger(precision) ? Math.max(0, Math.min(precision, 10)) : 4;
  if (Math.abs(value) >= 1e21 || (value !== 0 && Number(value.toFixed(digits)) === 0)) {
    return new Intl.NumberFormat(undefined, { notation: 'scientific', maximumSignificantDigits: Math.max(3, digits) }).format(value);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, useGrouping: true }).format(value);
}
function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useStored('omni-theme', false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const nav = [
    { href: '/', label: 'Unit converter', icon: Ruler },
    { href: '/currency', label: 'Currency', icon: WalletCards },
    { href: '/favorites', label: 'Favorites', icon: Heart },
    { href: '/history', label: 'History', icon: History },
  ];
  return <div className="app-shell">
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-border bg-card px-5 py-6 transition-transform md:translate-x-0 ${menuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <Link href="/" className="flex items-center gap-3 px-2 no-underline" data-testid="link-brand">
        <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-primary text-primary-foreground"><ArrowLeftRight size={20}/></span>
        <span><span className="display-font block text-[17px] font-extrabold tracking-[-.04em]">omni<span className="text-primary">convert</span></span><span className="text-[10px] tracking-[.16em] text-muted-foreground">A LITTLE MORE PRECISE</span></span>
      </Link>
      <div className="mb-2 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Workspace</div>
      <nav className="space-y-1" aria-label="Main navigation">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold no-underline transition-colors ${location === href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={17}/>{label}{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"/>}</Link>)}
      </nav>
      <div className="mt-auto rounded-2xl bg-secondary/70 p-4">
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold">Good to know</span><Compass size={15} className="text-primary"/></div>
        <p className="m-0 text-xs leading-5 text-muted-foreground">Every conversion stays on your device. Currency rates come from a live provider.</p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border px-2 pt-4">
        <span className="text-xs font-medium text-muted-foreground">Appearance</span>
        <button onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} data-testid="button-theme" className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">{dark ? <Sun size={16}/> : <Moon size={16}/>}</button>
      </div>
    </aside>
    {menuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-foreground/25 md:hidden" onClick={() => setMenuOpen(false)} data-testid="button-close-menu"/>}
    <main className="min-h-[100dvh] md:pl-[250px]">
      <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10">
        <button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted md:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)} data-testid="button-open-menu"><Menu size={19}/></button>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="text-foreground font-semibold">Workspace</span><span>/</span><span>{nav.find(item => item.href === location)?.label ?? 'OmniConvert'}</span></div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary"/><span>Ready when you are</span></div>
      </header>
      <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-8 md:px-10 md:pt-11">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</div><h1 className="display-font m-0 text-[32px] font-extrabold leading-tight tracking-[-.055em] md:text-[39px]">{title}</h1><p className="mb-0 mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">{description}</p></div>{aside}</div>;
}
function FieldLabel({ children }: { children: ReactNode }) { return <label className="mb-2 block text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground">{children}</label>; }
function Select({ value, onChange, children, testId, label }: { value: string; onChange: (v: string) => void; children: ReactNode; testId: string; label: string }) {
  return <div className="relative"><select aria-label={label} value={value} onChange={e => onChange(e.target.value)} data-testid={testId} className="h-12 w-full appearance-none rounded-xl border border-input bg-background px-4 pr-10 text-sm font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15">{children}</select><ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"/></div>;
}
function UnitPage() {
  const params = new URLSearchParams(window.location.search);
  const [, setLocation] = useLocation();
  const initialCategory = categories.find(c => c.id === params.get('category'))?.id ?? readStore(CATEGORY_STORAGE, 'length');
  const [categoryId, setCategoryId] = useState(initialCategory);
  const category = categories.find(item => item.id === categoryId) ?? categories[0];
  const units = category.units;
  const [amount, setAmount] = useState(params.get('amount') ?? '1');
  const [fromId, setFromId] = useState(params.get('from') ?? units[0].symbol);
  const [toId, setToId] = useState(params.get('to') ?? units[Math.min(1, units.length - 1)].symbol);
  const [precision, setPrecision] = useStored(PRECISION_STORAGE, 4);
  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const from = units.find(item => item.symbol === fromId) ?? units[0];
  const to = units.find(item => item.symbol === toId) ?? units[1] ?? units[0];
  const parsed = Number(amount);
  const inputValid = amount.trim() !== '' && Number.isFinite(parsed)
    && (categoryId !== 'fuel' || parsed > 0)
    && (categoryId !== 'temperature'
      || (from.symbol !== '°C' || parsed >= -273.15)
      && (from.symbol !== 'K' || parsed >= 0)
      && (from.symbol !== '°F' || parsed >= -459.67));
  const converted = inputValid ? convert(category, parsed, from, to) : NaN;
  const valid = inputValid && Number.isFinite(converted);
  const result = valid ? converted : NaN;
  const normalizedSearch = normalizeSearch(search);
  const visibleCategories = categories.filter(item => normalizeSearch(`${item.name} ${item.id} ${item.units.map(u => `${u.name} ${u.symbol}`).join(' ')}`).includes(normalizedSearch));
  const matchingUnits = normalizedSearch ? categories.flatMap(item => item.units.filter(u => normalizeSearch(`${u.name} ${u.symbol} ${item.name}`).includes(normalizedSearch)).map(u => ({ ...u, category: item }))).slice(0, 7) : [];
  useEffect(() => { try { localStorage.setItem(CATEGORY_STORAGE, JSON.stringify(categoryId)); } catch { /* Keep the current session usable if storage is blocked. */ } }, [categoryId]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('category', categoryId); url.searchParams.set('amount', amount); url.searchParams.set('from', from.symbol); url.searchParams.set('to', to.symbol);
    window.history.replaceState({}, '', url);
  }, [categoryId, amount, from.symbol, to.symbol]);
  useEffect(() => {
    if (!valid || amount === '') return;
    const timeout = window.setTimeout(() => setHistory(old => [
      { id: `${Date.now()}`, category: categoryId, amount, from: from.symbol, to: to.symbol, result: String(result), created: Date.now() },
      ...old.filter(item => !(item.category === categoryId && item.amount === amount && item.from === from.symbol && item.to === to.symbol)),
    ].slice(0, historyLimit)), 400);
    return () => window.clearTimeout(timeout);
  }, [categoryId, amount, from.symbol, to.symbol, valid, result, historyLimit, setHistory]);
  const swap = () => { setFromId(to.symbol); setToId(from.symbol); };
  const copy = async () => { await navigator.clipboard?.writeText(String(result)); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const saveFavorite = () => {
    const item = { id: `${categoryId}:${from.symbol}:${to.symbol}`, category: categoryId, amount, from: from.symbol, to: to.symbol, result: String(result), created: Date.now() };
    setFavorites(old => old.some(f => f.id === item.id) ? old.filter(f => f.id !== item.id) : [item, ...old]);
  };
  const isFavorite = favorites.some(f => f.id === `${categoryId}:${from.symbol}:${to.symbol}`);
  const copyShare = async () => { await navigator.clipboard?.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <>
    <PageHeading eyebrow="The everyday converter" title="Make the units make sense." description="A clear answer, across 22 measurement categories. No mental arithmetic required." aside={<button onClick={copyShare} data-testid="button-share-conversion" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted"><Share2 size={15}/>{copied ? 'Link copied' : 'Share conversion'}</button>}/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card-surface overflow-hidden rounded-[22px]">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
          <div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">01 / Pick a measure</div><div className="mt-1 text-sm font-bold">What are we converting?</div></div>
          <div className="relative w-full md:max-w-[300px]"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find category or unit…" aria-label="Search categories and units" data-testid="input-search-units" className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-xs outline-none focus:border-primary"/>
            {matchingUnits.length > 0 && <div className="absolute left-0 right-0 top-[46px] z-10 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl">{matchingUnits.map(match => <button key={`${match.category.id}-${match.symbol}`} onClick={() => { setCategoryId(match.category.id); setFromId(match.symbol); setToId(match.category.units.find(u => u.symbol !== match.symbol)?.symbol ?? match.symbol); setSearch(''); }} data-testid={`button-search-unit-${match.category.id}-${match.symbol}`} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"><span className="text-xs font-semibold">{match.name} <span className="mono text-muted-foreground">({match.symbol})</span></span><span className="text-[10px] text-muted-foreground">{match.category.name}</span></button>)}</div>}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3 md:px-7" role="group" aria-label="Unit categories">
          {visibleCategories.map(item => <button key={item.id} aria-pressed={categoryId === item.id} onClick={() => { setCategoryId(item.id); setFromId(item.units[0].symbol); setToId(item.units[Math.min(1, item.units.length - 1)].symbol); setSearch(''); }} data-testid={`tab-category-${item.id}`} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${categoryId === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted/65 text-muted-foreground hover:text-foreground'}`}>{item.name}</button>)}
          {!visibleCategories.length && <span className="py-2 text-xs text-muted-foreground">No matching category or unit.</span>}
        </div>
        <div className="p-5 md:p-7">
          <div className="mb-5 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/25 text-lg font-semibold text-foreground">{category.icon}</span><div><div className="text-sm font-bold">{category.name}</div><div className="text-[11px] text-muted-foreground">{units.length} units available</div></div><span className="ml-auto text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">02 / Set your values</span></div>
          <div className="grid items-end gap-3 md:grid-cols-[1fr_42px_1fr]">
            <div><FieldLabel>From</FieldLabel><Select label="Convert from unit" testId="select-from-unit" value={from.symbol} onChange={setFromId}>{units.map(u => <option key={u.symbol} value={u.symbol}>{u.name} ({u.symbol})</option>)}</Select><input inputMode="decimal" type="number" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount to convert" data-testid="input-amount" className="mono mt-3 h-[68px] w-full rounded-xl border border-input bg-background px-4 text-[25px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="Enter amount"/></div>
            <button onClick={swap} aria-label="Swap units" data-testid="button-swap-units" className="mb-2 grid h-10 w-10 place-items-center justify-self-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"><ArrowDownUp size={17}/></button>
            <div><FieldLabel>To</FieldLabel><Select label="Convert to unit" testId="select-to-unit" value={to.symbol} onChange={setToId}>{units.map(u => <option key={u.symbol} value={u.symbol}>{u.name} ({u.symbol})</option>)}</Select><div className="mono mt-3 flex h-[68px] items-center rounded-xl border border-primary/25 bg-primary/[.045] px-4 text-[25px] font-semibold text-primary" data-testid="text-conversion-result">{valid ? nice(result, precision) : '—'}<span className="ml-2 text-sm font-medium opacity-65">{to.symbol}</span></div></div>
          </div>
          {!valid && <div role="alert" data-testid="status-validation" className="mt-3 flex items-center gap-2 text-xs text-destructive"><CircleAlert size={14}/>{amount.trim() === '' ? 'Enter a value to convert.' : 'Enter a valid value for this unit.'}</div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid h-7 w-7 place-items-center rounded-lg bg-muted"><Settings2 size={14}/></span><label htmlFor="precision" className="font-medium">Decimal places</label><select id="precision" value={precision} onChange={e => setPrecision(Number(e.target.value))} data-testid="select-precision" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-semibold text-foreground">{[2,3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} places</option>)}</select></div>
            <div className="flex gap-2">
              <button onClick={saveFavorite} disabled={!valid} data-testid="button-toggle-favorite" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${isFavorite ? 'border-accent bg-accent/20 text-foreground' : 'border-border hover:bg-muted'}`}><Star size={14} fill={isFavorite ? 'currentColor' : 'none'}/>{isFavorite ? 'Pinned' : 'Pin conversion'}</button>
              <button onClick={copy} disabled={!valid} data-testid="button-copy-result" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40">{copied ? <Check size={14}/> : <Copy size={14}/ >}{copied ? 'Copied' : 'Copy result'}</button>
              <button onClick={() => { setAmount('1'); setSearch(''); }} data-testid="button-reset-conversion" aria-label="Reset conversion" className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted"><RotateCcw size={14}/></button>
            </div>
          </div>
        </div>
      </section>
      <aside className="space-y-5">
        <div className="card-surface rounded-[22px] p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">The working</div><div className="mt-1 text-sm font-bold">Conversion, explained</div></div><span className="grid h-8 w-8 place-items-center rounded-full bg-accent/25"><Info size={15}/></span></div>
          <div className="rounded-xl bg-muted/70 p-4"><div className="mono text-[11px] text-muted-foreground">{category.temperature ? 'Temperature scale relation' : `1 ${from.symbol} = ${nice(convert(category, 1, from, to), precision)} ${to.symbol}`}</div><div className="mono mt-2 break-words text-sm font-semibold">{category.temperature || category.id === 'fuel' ? `${amount || 'x'} ${from.symbol} → ${valid ? nice(result, precision) : '—'} ${to.symbol}` : `${amount || 'x'} × ${nice(from.factor / to.factor, precision)} = ${valid ? nice(result, precision) : '—'}`}</div></div>
          <p className="mb-0 mt-4 text-xs leading-5 text-muted-foreground">{category.temperature ? 'Temperature uses an offset scale, so it cannot be converted with a simple multiplier.' : category.id === 'fuel' ? 'Fuel economy is an inverse relationship: higher distance per liter means fewer liters per 100 kilometers.' : `We multiply your value by the ${from.name.toLowerCase()} to ${to.name.toLowerCase()} ratio. The result is rounded to ${precision} decimal places.`}{category.assumption ? ` ${category.assumption}` : ''}</p>
        </div>
        <div className="rounded-[22px] bg-[#173d3a] p-5 text-[#eef4e8] md:p-6">
          <div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#b5c9b7]">Quick reference</div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px]">{category.name}</span></div>
          <div className="mt-5 space-y-3">{units.slice(0, 4).map((u, i) => <div key={u.symbol} className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0"><span className="text-xs text-[#c8d7cd]">{u.name}</span><span className="mono text-xs font-medium">{nice(convert(category, valid ? parsed : 1, from, u), precision)} {u.symbol}</span></div>)}</div>
        </div>
      </aside>
    </div>
    <section className="mt-6">
      <button onClick={() => setShowAll(value => !value)} aria-expanded={showAll} data-testid="button-toggle-all-units" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:bg-muted">
        {showAll ? 'Hide all equivalents' : `See all ${units.length - 1} equivalents`}<ChevronDown size={14} className={`transition-transform ${showAll ? 'rotate-180' : ''}`}/>
      </button>
      {showAll && <div className="card-surface mt-3 grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 xl:grid-cols-3" data-testid="list-all-unit-equivalents">
        {units.filter(item => item.symbol !== from.symbol).map(item => <div key={item.symbol} className="flex min-w-0 items-center justify-between gap-4 bg-card px-4 py-3.5">
          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mono text-[10px] text-muted-foreground">{item.symbol}</span></span>
          <span className="mono text-right text-sm font-semibold text-primary" data-testid={`text-equivalent-${item.symbol}`}>{valid ? nice(convert(category, parsed, from, item), precision) : '—'}</span>
        </div>)}
      </div>}
    </section>
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.17em] text-muted-foreground">Your recent work</div><h2 className="display-font mb-0 mt-1 text-lg font-bold tracking-tight">Back to what you were converting</h2></div><Link href="/history" className="inline-flex items-center gap-1 text-xs font-bold text-primary no-underline hover:underline" data-testid="link-view-history">View history <ArrowRight size={14}/></Link></div>
      {history.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{history.slice(0,3).map(item => <button key={item.id} onClick={() => { if (item.category === 'currency') { setLocation(`/currency?category=currency&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`); return; } setCategoryId(item.category); setAmount(item.amount); setFromId(item.from); setToId(item.to); }} data-testid={`button-repeat-recent-${item.id}`} className="card-surface flex items-center justify-between rounded-xl px-4 py-3 text-left hover:border-primary/40"><span><span className="block text-[11px] text-muted-foreground">{item.category === 'currency' ? 'Currency' : categories.find(c => c.id === item.category)?.name ?? item.category}</span><span className="mono mt-1 block text-sm font-semibold">{item.amount} {item.from} <ArrowRight className="mx-1 inline" size={12}/> {nice(Number(item.result), precision)} {item.to}</span></span><Clock3 size={15} className="text-muted-foreground"/></button>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Your recent conversions will show up here.</div>}
    </section>
  </>;
}

function CurrencyPage() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialBase = currencyCode(initialParams.get('base') ?? initialParams.get('from'), 'USD');
  const initialTarget = currencyCode(initialParams.get('target') ?? initialParams.get('to'), 'EUR');
  const [base, setBase] = useState<CurrencyCode>(initialBase);
  const [target, setTarget] = useState<CurrencyCode>(initialTarget === initialBase
    ? currencies.find(([code]) => code !== initialBase)?.[0] ?? 'EUR'
    : initialTarget);
  const [manualRefresh, setManualRefresh] = useState(false);
  const [amount, setAmount] = useState(initialParams.get('amount') ?? '100');
  const [precision] = useStored(PRECISION_STORAGE, 4);
  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [copied, setCopied] = useState(false);
  const queryParams = { base, ...(manualRefresh ? { refresh: '1' as const } : {}) };
  const query = useGetCurrencyRates(queryParams, { query: { queryKey: ['/api/currency/rates', queryParams], refetchOnWindowFocus: true, staleTime: 60_000 } });
  const data = query.data;
  const rate = data?.rates?.[target];
  const validAmount = amount.trim() !== '' && Number.isFinite(Number(amount));
  const currencyDigits = (code: string) => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch { return 2; } };
  const output = validAmount && typeof rate === 'number' ? Number(amount) * rate : NaN;
  const fmt = (value: number, code: string) => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: currencyDigits(code), minimumFractionDigits: currencyDigits(code) }).format(value) : '—';
  const rateText = typeof rate === 'number' ? `1 ${base} = ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(rate)} ${target}` : '';
  const updateTime = data?.updatedAt ? new Date(data.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const favoriteId = `currency:${base}:${target}`;
  const isFavorite = favorites.some(item => item.id === favoriteId);
  const currencySymbol = (code: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(part => part.type === 'currency')?.value ?? code;
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('category', 'currency');
    url.searchParams.set('amount', amount);
    url.searchParams.set('from', base);
    url.searchParams.set('to', target);
    window.history.replaceState({}, '', url);
  }, [base, target, amount]);
  useEffect(() => {
    if (!validAmount || !Number.isFinite(output) || typeof rate !== 'number') return;
    const timeout = window.setTimeout(() => {
      const item: RecordItem = {
        id: `currency:${Date.now()}`,
        category: 'currency',
        amount,
        from: base,
        to: target,
        result: String(output),
        created: Date.now(),
      };
      setHistory(old => [
        item,
        ...old.filter(entry => !(entry.category === 'currency' && entry.amount === amount && entry.from === base && entry.to === target)),
      ].slice(0, historyLimit));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [amount, base, output, rate, setHistory, target, validAmount, historyLimit]);
  const toggleFavorite = () => {
    const item: RecordItem = {
      id: favoriteId,
      category: 'currency',
      amount: validAmount ? amount : '1',
      from: base,
      to: target,
      result: String(output),
      created: Date.now(),
    };
    setFavorites(old => old.some(entry => entry.id === favoriteId)
      ? old.filter(entry => entry.id !== favoriteId)
      : [item, ...old]);
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
    url.searchParams.set('category', 'currency');
    url.searchParams.set('amount', amount);
    url.searchParams.set('from', base);
    url.searchParams.set('to', target);
    void copyText(url.toString());
  };
  return <>
    <PageHeading eyebrow="Live currency" title="A clearer view of exchange." description="Current provider rates for 15 currencies. Useful for planning; your bank may use a different rate." aside={<div className="flex flex-wrap gap-2"><button onClick={sharePair} data-testid="button-share-currency" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold"><Share2 size={14}/>{copied ? 'Link copied' : 'Share pair'}</button><button onClick={() => { if (manualRefresh) void query.refetch(); else setManualRefresh(true); }} disabled={query.isFetching} data-testid="button-refresh-rates" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''}/>{query.isFetching ? 'Updating' : 'Refresh rates'}</button></div>}/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="card-surface overflow-hidden rounded-[22px]">
        <div className="border-b border-border bg-secondary/45 px-5 py-5 md:px-7"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Rate desk / Today</div><div className="mt-1 text-sm font-bold">Convert with a live reference rate</div></div>
        <div className="p-5 md:p-7">
          <div className="grid items-end gap-3 md:grid-cols-[1fr_42px_1fr]">
            <div><FieldLabel>You have</FieldLabel><Select label="Base currency" testId="select-base-currency" value={base} onChange={code => { const next = code as CurrencyCode; setBase(next); setManualRefresh(false); if (target === next) setTarget(currencies.find(([candidate]) => candidate !== next)?.[0] ?? 'USD'); }}>{currencies.map(([code,name]) => <option key={code} value={code}>{code} · {currencySymbol(code)} · {name}</option>)}</Select><input inputMode="decimal" type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount to convert" data-testid="input-currency-amount" className="mono mt-3 h-[68px] w-full rounded-xl border border-input bg-background px-4 text-[25px] font-medium outline-none focus:border-primary" /></div>
            <button onClick={() => { setBase(target); setTarget(base); setManualRefresh(false); }} aria-label="Swap currencies" data-testid="button-swap-currencies" className="mb-2 grid h-10 w-10 place-items-center justify-self-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"><ArrowLeftRight size={17}/></button>
            <div><FieldLabel>You get</FieldLabel><Select label="Target currency" testId="select-target-currency" value={target} onChange={code => setTarget(code as CurrencyCode)}>{currencies.filter(([code]) => code !== base).map(([code,name]) => <option key={code} value={code}>{code} · {currencySymbol(code)} · {name}</option>)}</Select><div className="mono mt-3 flex h-[68px] items-center rounded-xl border border-primary/25 bg-primary/[.045] px-4 text-[25px] font-bold text-primary" data-testid="text-currency-result">{query.isLoading ? <span className="h-7 w-36 animate-pulse rounded bg-primary/15"/> : fmt(output, target)}</div></div>
          </div>
          {!validAmount && <p role="alert" data-testid="status-currency-validation" className="mt-3 text-xs text-destructive">Enter a finite amount.</p>}
          {query.isError && <div role="alert" data-testid="status-rates-error" className="mt-5 flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CircleAlert size={17} className="mt-0.5 shrink-0 text-destructive"/><div><div className="text-sm font-semibold">Rates aren’t available right now</div><p className="mb-0 mt-1 text-xs text-muted-foreground">Check your connection and try again.</p></div></div><button onClick={() => { if (manualRefresh) void query.refetch(); else setManualRefresh(true); }} data-testid="button-retry-rates" className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">Try again</button></div>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={toggleFavorite} disabled={!Number.isFinite(output)} data-testid="button-toggle-currency-favorite" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold disabled:opacity-40 ${isFavorite ? 'border-accent bg-accent/20 text-foreground' : 'border-border hover:bg-muted'}`}><Star size={14} fill={isFavorite ? 'currentColor' : 'none'}/>{isFavorite ? 'Pair pinned' : 'Pin currency pair'}</button>
            <button onClick={() => void copyText(fmt(output, target))} disabled={!Number.isFinite(output)} data-testid="button-copy-currency-result" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40">{copied ? <Check size={14}/> : <Copy size={14}/>}Copy result</button>
          </div>
          {!query.isLoading && data && <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Exchange rate used</div><div className="mono mt-1 text-sm font-semibold" data-testid="text-exchange-rate">{rateText || 'Rate unavailable for this pair'}</div></div><span data-testid="status-rate-freshness" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${data.stale ? 'bg-accent/20 text-foreground' : 'bg-primary/10 text-primary'}`}><span className={`h-1.5 w-1.5 rounded-full ${data.stale ? 'bg-accent' : 'bg-primary'}`}/>{data.stale ? 'Cached rate' : 'Provider rate'}</span></div>
            {data.stale && <p className="mb-0 mt-3 rounded-lg bg-accent/15 px-3 py-2 text-xs leading-5" data-testid="text-stale-disclosure">This is a cached rate and may not reflect the latest market. Refresh to check for a newer update.</p>}
          </div>}
        </div>
      </section>
      <aside className="space-y-5">
        <div className="card-surface rounded-[22px] p-5 md:p-6"><div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Rate status</div><div className="mt-1 text-sm font-bold">Source & timing</div></div><Clock3 size={17} className="text-primary"/></div>
          {query.isLoading && <div className="space-y-3" data-testid="status-rates-loading"><div className="h-4 w-3/4 animate-pulse rounded bg-muted"/><div className="h-4 w-1/2 animate-pulse rounded bg-muted"/><div className="h-4 w-2/3 animate-pulse rounded bg-muted"/></div>}
          {!query.isLoading && data && <dl className="m-0 space-y-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Provider</dt><dd className="m-0 max-w-[150px] text-right font-semibold" data-testid="text-rate-provider">{data.provider}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last updated</dt><dd className="m-0 text-right font-semibold" data-testid="text-rate-updated">{updateTime ?? 'Not supplied'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Fetched</dt><dd className="m-0 text-right font-semibold">{data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : 'Just now'}</dd></div></dl>}
          {!query.isLoading && query.isError && <p className="mb-0 text-xs leading-5 text-muted-foreground">The rate feed could not be reached. No estimated or placeholder rates are shown.</p>}
        </div>
        <div className="rounded-[22px] bg-[#173d3a] p-5 text-[#eef4e8] md:p-6"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#b5c9b7]"><Info size={14}/>A practical note</div><p className="mb-0 mt-4 text-sm leading-6">These are provider reference rates, not a quote. Banks, card networks and money-transfer services may add fees or use their own rates.</p><div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-[#bdcec1]">Historical charting is not available from the selected rate provider.</div></div>
      </aside>
    </div>
    <div className="mt-6 flex flex-wrap gap-2">{currencies.filter(([code]) => code !== base).slice(0, 7).map(([code, name]) => <button key={code} onClick={() => setTarget(code)} data-testid={`button-shortcut-currency-${code}`} className={`rounded-full border px-3 py-2 text-[11px] font-semibold ${target === code ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{code} <span className="font-normal opacity-70">{name}</span></button>)}</div>
  </>;
}

function CollectionPage({ mode }: { mode: 'favorites' | 'history' }) {
  const [favorites, setFavorites] = useStored<RecordItem[]>(FAV_STORAGE, []);
  const [history, setHistory] = useStored<RecordItem[]>(HISTORY_STORAGE, []);
  const [storedHistoryLimit, setHistoryLimit] = useStored<number>(HISTORY_LIMIT_STORAGE, 35);
  const historyLimit = normalizeHistoryLimit(storedHistoryLimit);
  const [location, setLocation] = useLocation();
  const items = mode === 'favorites' ? favorites : history;
  const setItems = mode === 'favorites' ? setFavorites : setHistory;
  const isFavorites = mode === 'favorites';
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (history.length > historyLimit) setHistory(old => old.slice(0, historyLimit));
  }, [history.length, historyLimit, setHistory]);
  const repeat = (item: RecordItem) => {
    if (item.category === 'currency') {
      setLocation(`/currency?category=currency&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
      return;
    }
    setLocation(`/?category=${encodeURIComponent(item.category)}&amount=${encodeURIComponent(item.amount)}&from=${encodeURIComponent(item.from)}&to=${encodeURIComponent(item.to)}`);
  };
  const remove = (item: RecordItem) => setItems(old => old.filter(entry => entry.id !== item.id));
  const clear = () => { setItems([]); setNotice(isFavorites ? 'All pinned conversions removed.' : 'Recent conversions cleared.'); window.setTimeout(() => setNotice(''), 2800); };
  const actions = isFavorites
    ? (items.length > 0 ? <button onClick={clear} data-testid="button-clear-favorites" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive"><Trash2 size={14}/>Remove all</button> : null)
    : <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium">
        Keep
        <select aria-label="Maximum recent conversions" value={historyLimit} onChange={event => setHistoryLimit(Number(event.target.value))} data-testid="select-history-limit" className="bg-transparent font-semibold outline-none">
          {HISTORY_LIMIT_OPTIONS.map(limit => <option key={limit} value={limit}>{limit}</option>)}
        </select>
        recent
      </label>
      {items.length > 0 && <button onClick={clear} data-testid="button-clear-history" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-destructive/40 hover:text-destructive"><Trash2 size={14}/>Clear history</button>}
    </div>;
  return <>
    <PageHeading eyebrow={isFavorites ? 'Saved for later' : 'Your trail' } title={isFavorites ? 'Your pinned conversions.' : 'A little history.'} description={isFavorites ? 'Keep the pairs you reach for close. Your pins stay on this device.' : 'Recent conversions are ready to repeat, whenever you need them again.'} aside={actions}/>
    {notice && <div role="status" className="mb-4 rounded-lg bg-primary/10 px-4 py-3 text-xs text-primary" data-testid="status-collection-cleared">{notice}</div>}
    {items.length ? <div className="space-y-3">{items.map((item, index) => <article key={item.id} className="card-surface soft-in flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:p-5" data-testid={`card-${mode}-${item.id}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-lg font-semibold text-primary">{isFavorites ? <Star size={18}/> : <span className="mono text-xs">{String(index + 1).padStart(2, '0')}</span>}</span>
      <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">{item.category === 'currency' ? 'Currency' : categories.find(c => c.id === item.category)?.name ?? item.category}</span><span className="text-muted-foreground">·</span><span className="text-[10px] text-muted-foreground">{new Date(item.created).toLocaleDateString()}</span></div><div className="mono flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{item.amount} {item.from}</span><ArrowRight size={14} className="text-primary"/><span className="text-primary">{Number.isFinite(Number(item.result)) ? nice(Number(item.result), readStore(PRECISION_STORAGE, 4)) : '—'} {item.to}</span></div></div>
      <div className="flex gap-2"><button onClick={() => repeat(item)} data-testid={`button-repeat-${mode}-${item.id}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><RotateCcw size={13}/>Convert again</button><button aria-label="Remove conversion" onClick={() => remove(item)} data-testid={`button-remove-${mode}-${item.id}`} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"><X size={15}/></button></div>
    </article>)}</div> : <div className="card-surface quiet-grid flex min-h-[330px] flex-col items-center justify-center rounded-[24px] px-6 text-center" data-testid={`empty-${mode}`}><div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">{isFavorites ? <Heart size={24}/> : <History size={24}/>}</div><div className="display-font text-xl font-bold">{isFavorites ? 'Nothing pinned just yet.' : 'A fresh start.'}</div><p className="mb-5 mt-2 max-w-[350px] text-sm leading-6 text-muted-foreground">{isFavorites ? 'When a conversion becomes a regular, pin it from the converter and it’ll be waiting here.' : 'Conversions you make are kept on this device, ready to use again.'}</p><Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground no-underline" data-testid="link-empty-convert">Open the converter <ArrowRight size={14}/></Link></div>}
  </>;
}

function Router() {
  return <RoutedErrorBoundary><AppShell><Switch>
    <Route path="/" component={UnitPage}/>
    <Route path="/currency" component={CurrencyPage}/>
    <Route path="/favorites"><CollectionPage mode="favorites"/></Route>
    <Route path="/history"><CollectionPage mode="history"/></Route>
    <Route component={NotFound}/>
  </Switch></AppShell></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
