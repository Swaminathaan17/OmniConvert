import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeftRight,
  ChevronDown,
  Compass,
  FlaskConical,
  Heart,
  History,
  Layers,
  Menu,
  Moon,
  Puzzle,
  Ruler,
  Sun,
  WalletCards,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online";
import { useStored } from "@/hooks/use-stored";

export const navItems = [
  { href: "/", label: "Unit converter", icon: Ruler },
  { href: "/currency", label: "Currency", icon: WalletCards },
  { href: "/batch", label: "Batch lab", icon: FlaskConical },
  { href: "/units", label: "Custom units", icon: Puzzle },
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/history", label: "History", icon: History },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useStored("omni-theme", false);
  const [menuOpen, setMenuOpen] = useState(false);
  const online = useOnlineStatus();

  // Apply the theme class on every render where it may have changed.
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-border bg-card px-5 py-6 transition-transform md:translate-x-0 ${menuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
      >
        <Link href="/" className="flex items-center gap-3 px-2 no-underline" data-testid="link-brand">
          <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-primary text-primary-foreground">
            <ArrowLeftRight size={20} />
          </span>
          <span>
            <span className="display-font block text-[17px] font-extrabold tracking-[-.04em]">
              omni<span className="text-primary">convert</span>
            </span>
            <span className="text-[10px] tracking-[.16em] text-muted-foreground">A LITTLE MORE PRECISE</span>
          </span>
        </Link>
        <div className="mb-2 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">
          Workspace
        </div>
        <nav className="space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              data-testid={`link-${label.toLowerCase().replaceAll(" ", "-")}`}
              aria-current={location === href ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold no-underline transition-colors ${location === href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon size={17} />
              {label}
              {location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-secondary/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold">Good to know</span>
            <Compass size={15} className="text-primary" />
          </div>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            Every unit conversion runs on your device. Currency rates come from a live provider.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border px-2 pt-4">
          <span className="text-xs font-medium text-muted-foreground">Appearance</span>
          <button
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            data-testid="button-theme"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-foreground/25 md:hidden"
          onClick={() => setMenuOpen(false)}
          data-testid="button-close-menu"
        />
      )}
      <main className="min-h-[100dvh] md:pl-[250px]">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted md:hidden"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
            data-testid="button-open-menu"
          >
            <Menu size={19} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <span className="font-semibold text-foreground">Workspace</span>
            <span>/</span>
            <span>{navItems.find((item) => item.href === location)?.label ?? "OmniConvert"}</span>
          </div>
          <div
            className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
            data-testid="status-connection"
          >
            {online ? (
              <>
                <Wifi size={14} className="text-primary" />
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-accent-foreground" />
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span>Offline · core tools available</span>
              </>
            )}
          </div>
        </header>
        <div id="main-content" className="mx-auto max-w-[1180px] px-5 pb-16 pt-8 md:px-10 md:pt-11">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</div>
        <h1 className="display-font m-0 text-[32px] font-extrabold leading-tight tracking-[-.055em] md:text-[39px]">
          {title}
        </h1>
        <p className="mb-0 mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {aside}
    </div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-[11px] font-bold uppercase tracking-[.12em] text-muted-foreground"
    >
      {children}
    </label>
  );
}

export function Select({
  value,
  onChange,
  children,
  testId,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  testId: string;
  label: string;
  id?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="h-12 w-full appearance-none rounded-xl border border-input bg-background px-4 pr-10 text-sm font-semibold outline-none transition focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
