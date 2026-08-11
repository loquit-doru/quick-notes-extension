import {
  CHROME_WEB_STORE_URL,
  CONTACT_MAILTO,
  EDGE_ADDONS_URL,
  site,
} from "@/lib/site";

function FooterLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="text-slate-400 transition-colors hover:text-white"
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}

export function Footer() {
  const privacyHref = site.urls.privacy.startsWith("REPLACE_WITH_")
    ? "#privacy"
    : site.urls.privacy;

  return (
    <footer className="border-t border-white/5 bg-[#050810] py-10 sm:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div>
          <p className="text-lg font-semibold text-white">{site.name}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
            Local-first browser notes for focused work.
          </p>
        </div>
        <nav
          className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-2"
          aria-label="Footer"
        >
          <FooterLink href={CHROME_WEB_STORE_URL} label="Chrome Web Store" />
          <FooterLink href={EDGE_ADDONS_URL} label="Microsoft Edge Add-ons" />
          {!site.urls.privacy.startsWith("REPLACE_WITH_") ? (
            <FooterLink href={privacyHref} label="Privacy Policy" />
          ) : (
            <a
              href="#privacy"
              className="text-slate-400 transition-colors hover:text-white"
            >
              Privacy Policy
            </a>
          )}
          <a
            href={CONTACT_MAILTO}
            className="text-slate-400 transition-colors hover:text-white"
          >
            Contact
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-5 text-center text-xs text-slate-400/80 lg:px-8">
        © {new Date().getFullYear()} {site.name}. Works in Chromium-based
        browsers including Chrome and Edge.
      </p>
    </footer>
  );
}
