export function Problem() {
  return (
    <section className="border-y border-white/5 bg-white/[0.02] py-16 sm:py-20 lg:py-20">
      <div className="mx-auto max-w-4xl px-5 text-center lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/90">
          Why it exists
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Switching to a full notes app for one idea breaks your flow.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
          Quick Notes is for people who research, write, and multitask in the
          browser. Capture snippets, links, and next steps in seconds, then
          return to your tab.
        </p>
        <div className="mt-8 grid gap-3 text-left text-sm text-slate-300 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#0d1323] px-4 py-3">
            Instant popup capture
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0d1323] px-4 py-3">
            Notes stay on device
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0d1323] px-4 py-3">
            Works without sign-up
          </div>
        </div>
      </div>
    </section>
  );
}
