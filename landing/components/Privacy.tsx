import { site } from "@/lib/site";

export function Privacy() {
  const privacyHref = site.urls.privacy.startsWith("REPLACE_WITH_")
    ? "#"
    : site.urls.privacy;

  return (
    <section
      id="privacy"
      className="py-16 sm:py-20 lg:py-24"
      aria-labelledby="privacy-heading"
    >
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-950/55 via-[#0f172a] to-blue-950/40 p-7 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-[80px]" />
          <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-start">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                Trust by design
              </p>
              <h2
                id="privacy-heading"
                className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl"
              >
                Your notes belong to you.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
                No account. No cloud sync. No tracking. Your notes stay locally in
                your browser. Page context and review status never leave your
                device unless you export a backup yourself.
              </p>
              {!site.urls.privacy.startsWith("REPLACE_WITH_") && (
                <a
                  href={privacyHref}
                  className="mt-6 inline-flex text-sm font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read the full privacy policy →
                </a>
              )}
            </div>
            <ul className="grid gap-3 text-sm text-slate-200">
              <li className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3">
                Note content is not sent to external servers.
              </li>
              <li className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3">
                Local backup export is built into Settings.
              </li>
              <li className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3">
                Context capture is optional and kept locally.
              </li>
              <li className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3">
                Available on Chrome and Edge stores.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
