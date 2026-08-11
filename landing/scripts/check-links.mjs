import fs from "fs";

const html = fs.readFileSync(".next/server/app/index.html", "utf8");
const re = /<a[^>]*href="([^"]+)"[^>]*>([^<]*)</g;
let match;
const links = [];
while ((match = re.exec(html)) !== null) {
  links.push({ href: match[1], text: match[2].trim() });
}

const want = links.filter(
  (l) =>
    l.text.includes("Chrome") ||
    l.text.includes("Edge") ||
    l.text === "Contact" ||
    l.href.includes("chromewebstore") ||
    l.href.includes("microsoftedge") ||
    l.href.startsWith("mailto:")
);

console.log("Store/contact links in static HTML:\n");
for (const l of want) {
  console.log(`  ${l.text || "(no text)"}`);
  console.log(`    href=${l.href}`);
}

console.log(`\n#install placeholders: ${links.filter((l) => l.href === "#install").length}`);
console.log(`chromewebstore hrefs: ${links.filter((l) => l.href.includes("chromewebstore")).length}`);
console.log(`microsoftedge hrefs: ${links.filter((l) => l.href.includes("microsoftedge")).length}`);
console.log(`mailto contact: ${links.filter((l) => l.href === "mailto:quicknotes.extension@gmail.com").length}`);
console.log(`Contains "Add to Chrome" text: ${html.includes("Add to Chrome")}`);
console.log(`Contains target="_blank" on store links: ${html.includes('target="_blank"')}`);
console.log(`Contains rel="noopener noreferrer": ${html.includes('rel="noopener noreferrer"')}`);
