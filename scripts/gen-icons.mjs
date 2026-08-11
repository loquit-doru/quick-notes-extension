// Icon PNGs are generated from screenshots/quick_notes_icon_128x128.png
// Run: npm run gen-icons

import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'screenshots', 'quick_notes_icon_128x128.png');

if (!existsSync(source)) {
  console.error('Missing source:', source);
  process.exit(1);
}
console.log('Canonical icon source:', source);
console.log('Run: npm run gen-icons  (PowerShell resize -> icons/qn-*.png)');
