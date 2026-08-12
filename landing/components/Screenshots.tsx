import Image from "next/image";
import { screenshots } from "@/lib/site";

export function Screenshots() {
  return (
    <section
      id="screenshots"
      className="border-t border-white/5 bg-white/[0.02] py-16 sm:py-20 lg:py-24"
      aria-labelledby="screenshots-heading"
    >
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/90">
            Visual proof
          </p>
          <h2
            id="screenshots-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            See Quick Notes in action
          </h2>
          <p className="mt-4 text-slate-300">
            Real extension screens: quick capture, search, folders, and local-only
            storage. Pro features are marked as Pro.
          </p>
        </div>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin lg:mt-12 lg:grid lg:grid-cols-2 lg:gap-5 lg:overflow-visible lg:pb-0 xl:grid-cols-3">
          {screenshots.map((n, index) => (
            <figure
              key={n}
              className={`min-w-[min(100%,320px)] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 shadow-xl ring-1 ring-white/5 lg:min-w-0 ${
                index === 0 ? "lg:col-span-2 xl:col-span-2" : ""
              }`}
            >
              <Image
                src={`/assets/quick-notes/screenshot-${n}.png`}
                alt={`Quick Notes screenshot ${n}`}
                width={1280}
                height={800}
                className="h-auto w-full"
                sizes="(max-width: 768px) 90vw, (max-width: 1280px) 45vw, 33vw"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
