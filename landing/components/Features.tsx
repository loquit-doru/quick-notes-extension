import { features } from "@/lib/site";

export function Features() {
  return (
    <section
      id="features"
      className="py-16 sm:py-20 lg:py-24"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/90">
            Product highlights
          </p>
          <h2
            id="features-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            Clear value in one small popup
          </h2>
          <p className="mt-4 text-slate-300">
            Core capture stays free. Pro removes limits for heavier daily use.
          </p>
        </div>

        <ul className="mt-11 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-5">
          {features.map((feature) => (
            <li
              key={feature.title}
              className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-5 transition-all duration-300 hover:border-violet-400/35 hover:shadow-lg hover:shadow-violet-500/10 lg:p-6"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-xl ring-1 ring-violet-400/30"
                aria-hidden
              >
                {feature.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
