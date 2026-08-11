import { StoreButtons } from "./StoreButtons";

export function Cta() {
  return (
    <section
      id="install"
      className="border-t border-white/5 py-16 sm:py-20 lg:py-24"
      aria-labelledby="cta-heading"
    >
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/90">
          Ready to install
        </p>
        <h2
          id="cta-heading"
          className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl"
        >
          Start capturing notes in your browser.
        </h2>
        <p className="mt-4 text-slate-300">
          Start with 7 days of full access, then stay on the free plan or
          unlock Pro with a one-time upgrade.
        </p>
        <div className="mt-10 flex justify-center">
          <StoreButtons layout="stack" />
        </div>
      </div>
    </section>
  );
}
