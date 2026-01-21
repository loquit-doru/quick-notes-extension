// Script to generate PNG icons from SVG
// Run: node scripts/gen-icons.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');

const sizes = [16, 32, 48, 128];

// Simple SVG for each size
function generateSvg(size) {
  const padding = Math.round(size * 0.05);
  const rectSize = size - padding * 2;
  const cornerRadius = Math.round(size * 0.19);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="100%" style="stop-color:#3B82F6"/>
    </linearGradient>
  </defs>
  <rect x="${padding}" y="${padding}" width="${rectSize}" height="${rectSize}" rx="${cornerRadius}" fill="url(#grad)"/>
  <rect x="${size*0.22}" y="${size*0.16}" width="${size*0.56}" height="${size*0.69}" rx="${size*0.06}" fill="white" opacity="0.95"/>
  <line x1="${size*0.31}" y1="${size*0.33}" x2="${size*0.69}" y2="${size*0.33}" stroke="#CBD5E1" stroke-width="${Math.max(1, size*0.023)}" stroke-linecap="round"/>
  <line x1="${size*0.31}" y1="${size*0.45}" x2="${size*0.59}" y2="${size*0.45}" stroke="#CBD5E1" stroke-width="${Math.max(1, size*0.023)}" stroke-linecap="round"/>
  <line x1="${size*0.31}" y1="${size*0.58}" x2="${size*0.64}" y2="${size*0.58}" stroke="#CBD5E1" stroke-width="${Math.max(1, size*0.023)}" stroke-linecap="round"/>
</svg>`;
}

// Write SVG files (these will need to be converted to PNG manually or via online tool)
sizes.forEach(size => {
  const svg = generateSvg(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  console.log(`✅ Generated icon${size}.svg`);
});

console.log('\n📝 To convert to PNG:');
console.log('1. Open each SVG in a browser');
console.log('2. Use https://svgtopng.com/ or similar');
console.log('3. Save as icon16.png, icon32.png, etc.');
console.log('\nOr use ImageMagick:');
console.log('convert -background none icon.svg -resize 16x16 icon16.png');
