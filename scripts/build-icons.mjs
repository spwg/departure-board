/**
 * Renders the app icons from one SVG source.
 *
 * The mark is three departure rows — a destination bar in an NJ Transit line
 * colour plus a track chip — which stays legible down to favicon size. Content
 * sits inside the middle 62% of the canvas so Android's maskable crop cannot
 * clip it, which is why the same artwork serves both "any" and "maskable".
 *
 * Run with: npm run build-icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BACKGROUND = "#18181b";
const CHIP = "#fafafa";
// Northeast Corridor, North Jersey Coast, Morris & Essex.
const ROWS = [
  { color: "#F7505E", width: 208 },
  { color: "#009CDB", width: 248 },
  { color: "#00953B", width: 176 },
];

const SIZE = 512;
const ROW_HEIGHT = 44;
const GAP = 40;
const BAR_X = 96;
const CHIP_X = 368;
const CHIP_W = 48;

function svg({ background = BACKGROUND } = {}) {
  const total = ROWS.length * ROW_HEIGHT + (ROWS.length - 1) * GAP;
  const top = (SIZE - total) / 2;

  const rows = ROWS.map((row, i) => {
    const y = top + i * (ROW_HEIGHT + GAP);
    return `
    <rect x="${BAR_X}" y="${y}" width="${row.width}" height="${ROW_HEIGHT}" rx="${ROW_HEIGHT / 2}" fill="${row.color}"/>
    <rect x="${CHIP_X}" y="${y}" width="${CHIP_W}" height="${ROW_HEIGHT}" rx="14" fill="${CHIP}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${background}"/>${rows}
</svg>`;
}

const outputs = [
  { file: "public/icon-192.png", size: 192 },
  { file: "public/icon-512.png", size: 512 },
  // iOS applies its own rounding and does not honour transparency well, so the
  // Apple icon keeps the same full-bleed background.
  { file: "public/apple-icon.png", size: 180 },
  { file: "app/icon.png", size: 64 },
];

await mkdir(new URL("../public", import.meta.url), { recursive: true });

const source = Buffer.from(svg());
for (const { file, size } of outputs) {
  const png = await sharp(source, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(new URL(`../${file}`, import.meta.url), png);
  console.log(`Wrote ${file} (${size}x${size})`);
}
