import Image from "next/image";
import { site } from "@/lib/site";
import { StoreButtons } from "./StoreButtons";

export function Hero() {
  return (
    <section
      className="relative overflow-hidden pt-14 pb-16 sm:pt-16 sm:pb-20 lg:pt-24 lg:pb-24"
      aria-labelledby="hero-heading"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/2 h-[500px] w-[680px] -translate-x-1/2 rounded-full bg-violet-600/18 blur-[120px]" />
        <div className="absolute top-14 right-0 h-[360px] w-[360px] rounded-full bg-blue-600/14 blur-[96px]" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-11 px-5 sm:gap-12 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-violet-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            Browser extension
          </p>
          <h1
            id="hero-heading"
            className="max-w-[16ch] text-4xl font-bold leading-[1.06] tracking-tight text-white sm:max-w-none sm:text-5xl lg:text-[3.15rem]"
          >
            Capture browser notes before context switching
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Built for knowledge workers who collect ideas while browsing.
            Quick Notes opens fast, works locally, and keeps note content on
            your device. No account. No cloud sync. No tracking.
          </p>
          <div className="mt-7">
            <StoreButtons />
          </div>
          <ul className="mt-7 grid gap-2.5 text-sm text-slate-300 sm:grid-cols-2">
            <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              Local-first storage
            </li>
            <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              No account required
            </li>
            <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              Chrome + Edge support
            </li>
            <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              Optional one-time Pro
            </li>
          </ul>
          <p className="mt-5 text-sm font-medium tracking-wide text-slate-400">
            {site.tagline}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-violet-500/30 via-blue-500/20 to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-2xl shadow-violet-900/40 ring-1 ring-white/10">
            <Image
              src="/assets/quick-notes/screenshot-1.png"
              alt="Quick Notes extension showing the notes list with All Notes, Personal, and Work filters"
              width={1280}
              height={800}
              priority
              className="h-auto w-full"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
