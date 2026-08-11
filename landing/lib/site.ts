/** Canonical store & contact URLs — always present in static HTML for crawlers. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/quick-notes/nompejhpnnehhnedkgklfgpdgcfhkfem" as const;

export const EDGE_ADDONS_URL =
  "https://microsoftedge.microsoft.com/addons/detail/quick-notes/bpflnjinelkgbnbbjjddggnahdjhmadn" as const;

export const CONTACT_MAILTO = "mailto:quicknotes.extension@gmail.com" as const;

export const site = {
  name: "Quick Notes",
  title: "Quick Notes — Capture Notes Without Leaving Your Tab",
  description:
    "Capture ideas while browsing. Local-first notes with no account, no cloud sync, and optional Pro for power users.",
  tagline: "Capture fast • Stay local • Upgrade only if needed",
  urls: {
    chrome: CHROME_WEB_STORE_URL,
    edge: EDGE_ADDONS_URL,
    privacy:
      process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL ??
      "REPLACE_WITH_PRIVACY_POLICY_URL",
    contactEmail: "quicknotes.extension@gmail.com",
  },
} as const;

export const features = [
  {
    title: "Instant capture",
    description: "Save ideas while you browse, without switching apps.",
    icon: "⚡",
  },
  {
    title: "Page Memory",
    description: "Find notes for the current page or site with local-only matching.",
    icon: "🔖",
  },
  {
    title: "Inbox",
    description: "Keep fresh captures in Inbox until you review or archive them.",
    icon: "📥",
  },
  {
    title: "Quick search",
    description: "Find saved notes instantly (Pro after trial).",
    icon: "🔍",
  },
  {
    title: "Work and personal filters",
    description: "Separate notes by Work, Personal, and your custom folders.",
    icon: "📂",
  },
  {
    title: "Keyboard-friendly",
    description: "Use shortcuts like Ctrl+N for faster note-taking.",
    icon: "⌨️",
  },
  {
    title: "Offline-first",
    description: "Works without an account and without cloud sync.",
    icon: "📴",
  },
  {
    title: "Private by default",
    description: "Your notes stay locally in your browser.",
    icon: "🔒",
  },
] as const;

export const screenshots = [1, 2, 3, 4, 5] as const;
