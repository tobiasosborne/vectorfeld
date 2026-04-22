// Quantitative visual diff for spike 1: render source + graft output at the
// same DPI via pdftoppm, diff with pixelmatch. Reports pixel-diff percentage.
import { PNG } from '../../node_modules/pngjs/lib/png.js'
import pixelmatch from '../../node_modules/pixelmatch/index.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const srcPath = resolve('temp/spike-01-source-1.png')
const outPath = resolve('temp/spike-01-graft-1.png')
const diffPath = resolve('temp/spike-01-diff.png')

const src = PNG.sync.read(readFileSync(srcPath))
const out = PNG.sync.read(readFileSync(outPath))
if (src.width !== out.width || src.height !== out.height) {
  console.error(`Dimension mismatch: src=${src.width}x${src.height} out=${out.width}x${out.height}`)
  process.exit(1)
}
const diff = new PNG({ width: src.width, height: src.height })
const mismatch = pixelmatch(src.data, out.data, diff.data, src.width, src.height, { threshold: 0.1 })
const totalPixels = src.width * src.height
const pct = (mismatch / totalPixels) * 100
writeFileSync(diffPath, PNG.sync.write(diff))
console.log(`dims: ${src.width}x${src.height} (${totalPixels} px)`)
console.log(`mismatched pixels: ${mismatch} (${pct.toFixed(4)}%)`)
console.log(`diff written to ${diffPath}`)
process.exit(pct > 0.5 ? 1 : 0)
