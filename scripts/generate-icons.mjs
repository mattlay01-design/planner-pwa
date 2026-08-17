// One-off icon generator: renders scripts/icon.svg into public/ at the
// sizes vite-plugin-pwa's manifest and index.html's <link> tags expect.
// Rerun with `node scripts/generate-icons.mjs` if icon.svg changes.
import sharp from 'sharp'
import { readFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const svgPath = resolve('scripts/icon.svg')
const svg = readFileSync(svgPath)
const outDir = resolve('public')

const targets = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'maskable-icon-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'favicon-16x16.png', size: 16 },
]

for (const { file, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, file))
  console.log('wrote', file)
}

copyFileSync(svgPath, resolve(outDir, 'favicon.svg'))
console.log('wrote favicon.svg')

// favicon.ico: a simple PNG-in-ICO container at 32x32 (all modern browsers
// and Windows accept this; avoids pulling in a dedicated ICO encoder dep).
const png32 = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer()
const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0) // reserved
icoHeader.writeUInt16LE(1, 2) // type: icon
icoHeader.writeUInt16LE(1, 4) // image count

const dirEntry = Buffer.alloc(16)
dirEntry.writeUInt8(32, 0) // width
dirEntry.writeUInt8(32, 1) // height
dirEntry.writeUInt8(0, 2) // palette
dirEntry.writeUInt8(0, 3) // reserved
dirEntry.writeUInt16LE(1, 4) // color planes
dirEntry.writeUInt16LE(32, 6) // bits per pixel
dirEntry.writeUInt32LE(png32.length, 8) // image data size
dirEntry.writeUInt32LE(22, 12) // offset (6 header + 16 dir entry)

const { writeFileSync } = await import('node:fs')
writeFileSync(resolve(outDir, 'favicon.ico'), Buffer.concat([icoHeader, dirEntry, png32]))
console.log('wrote favicon.ico')
