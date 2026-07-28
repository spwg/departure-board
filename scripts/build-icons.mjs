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

/** Tested contract: one SVG source generates all declared PNG icons and a valid single-image ICO. */

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
  // Referenced by the web app manifest.
  { file: "public/icon-192.png", size: 192 },
  { file: "public/icon-512.png", size: 512 },
  // Next.js file conventions: these generate the icon and apple-touch-icon
  // link tags automatically. iOS applies its own rounding, so the Apple icon
  // keeps the same full-bleed background.
  { file: "app/apple-icon.png", size: 180 },
  { file: "app/icon.png", size: 64 },
];

await mkdir(new URL("../public", import.meta.url), { recursive: true });

const source = Buffer.from(svg());
const render = (size) =>
  sharp(source, { density: 384 }).resize(size, size).png().toBuffer();

for (const { file, size } of outputs) {
  await writeFile(new URL(`../${file}`, import.meta.url), await render(size));
  console.log(`Wrote ${file} (${size}x${size})`);
}

/**
 * Browsers request /favicon.ico regardless of the icon link tags, so serving
 * one avoids a 404 on every visit. ICO can wrap a PNG directly: a 6-byte
 * directory header, one 16-byte entry, then the PNG payload.
 */
const FAVICON_SIZE = 32;
const faviconPng = await render(FAVICON_SIZE);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image

const entry = Buffer.alloc(16);
entry.writeUInt8(FAVICON_SIZE, 0); // width
entry.writeUInt8(FAVICON_SIZE, 1); // height
entry.writeUInt8(0, 2); // palette size (0 = truecolour)
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(faviconPng.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12); // payload offset

await writeFile(
  new URL("../app/favicon.ico", import.meta.url),
  Buffer.concat([header, entry, faviconPng]),
);
console.log(`Wrote app/favicon.ico (${FAVICON_SIZE}x${FAVICON_SIZE})`);
