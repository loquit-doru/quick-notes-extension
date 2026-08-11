import Image from "next/image";
import { site } from "@/lib/site";
import { StoreButtons } from "./StoreButtons";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070b18]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
        <a href="#" className="flex items-center gap-3">
          <Image
            src="/assets/quick-notes/icon.png"
            alt=""
            width={36}
            height={36}
            className="rounded-lg shadow-md shadow-violet-500/25"
          />
          <span className="text-lg font-semibold tracking-tight text-white">
            {site.name}
          </span>
        </a>
        <nav
          className="hidden items-center gap-7 text-sm text-slate-300 md:flex"
          aria-label="Primary"
        >
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#screenshots" className="transition-colors hover:text-white">
            Screenshots
          </a>
          <a href="#privacy" className="transition-colors hover:text-white">
            Privacy
          </a>
        </nav>
        <div className="hidden sm:block">
          <StoreButtons layout="row" variantChrome="primary" variantEdge="ghost" />
        </div>
      </div>
    </header>
  );
}
