import type { ReactNode } from "react";
import { CHROME_WEB_STORE_URL, EDGE_ADDONS_URL } from "@/lib/site";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-violet-500 to-violet-400 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5",
  secondary:
    "border border-white/15 bg-white/5 text-white backdrop-blur-sm hover:border-violet-300/35 hover:bg-white/10",
  ghost: "text-slate-300 hover:text-violet-200",
};

function StoreLink({
  href,
  label,
  variant,
  icon,
}: {
  href: string;
  label: string;
  variant: Variant;
  icon: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`${base} ${variants[variant]}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {icon}
      {label}
    </a>
  );
}

const chromeIcon = (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
  </svg>
);

const edgeIcon = (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path d="M20.52 3.48A11.76 11.76 0 0 0 12.05 0C7.1 0 2.73 2.69 1.05 6.66a12 12 0 0 0 8.2 16.52 11.8 11.8 0 0 0 11.27-19.7zM12 21.5a9.5 9.5 0 0 1-8.9-6.2l4.6-2.7a4.7 4.7 0 0 0 4.3 2.5 4.6 4.6 0 0 0 4.4-3.3l4.7 2.7A9.5 9.5 0 0 1 12 21.5z" />
  </svg>
);

export function StoreButtons({
  layout = "row",
  variantChrome = "primary",
  variantEdge = "secondary",
}: {
  layout?: "row" | "stack";
  variantChrome?: Variant;
  variantEdge?: Variant;
}) {
  const wrap =
    layout === "stack"
      ? "flex flex-col gap-3 w-full sm:w-auto"
      : "flex flex-col sm:flex-row gap-3";

  return (
    <div className={wrap}>
      <StoreLink
        href={CHROME_WEB_STORE_URL}
        label="Add to Chrome"
        variant={variantChrome}
        icon={chromeIcon}
      />
      <StoreLink
        href={EDGE_ADDONS_URL}
        label="Add to Edge"
        variant={variantEdge}
        icon={edgeIcon}
      />
    </div>
  );
}
