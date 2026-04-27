// Golden-master suite runner.
//
// Modes:
//   node test/golden/run.mjs                    # verify all stories vs masters
//   node test/golden/run.mjs --record           # regenerate every master
//   node test/golden/run.mjs --record 03-text   # regenerate one master
//   node test/golden/run.mjs --only 03-text     # verify one story
//   node test/golden/run.mjs --accept 03-text   # promote pending → master
//
// Pass/fail: a story passes only when the canonicalized SVG AND canonicalized
// PDF extract both byte-match the committed master. Any diff writes the
// new output to masters/<name>.pending.{svg.canonical,pdf.json} plus a
// debug .pdf.png for visual inspection, and the run exits non-zero.
//
// Failure policy: a regression is filed as a new P1 bead manually. Do not
// silently re-record the master without explicit intent.

import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDevServer, launchBrowser, openPage, makeHelpers } from './harness.mjs'
import { canonicalizeSvg, canonicalizePdf } from './canonicalize.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const STORIES_DIR = resolve(here, 'stories')
const MASTERS_DIR = resolve(here, 'masters')
const PENDING_DIR = resolve(here, 'pending')
for (const d of [MASTERS_DIR, PENDING_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

function parseArgs(argv) {
  const args = { mode: 'verify', name: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--record') { args.mode = 'record'; args.name = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null }
    else if (a === '--only') { args.mode = 'verify'; args.name = argv[++i] }
    else if (a === '--accept') { args.mode = 'accept'; args.name = argv[++i] }
    else if (a === '--help' || a === '-h') { args.mode = 'help' }
  }
  return args
}

function help() {
  console.log(`Usage:
  node test/golden/run.mjs                      Verify all stories
  node test/golden/run.mjs --only NAME          Verify one story
  node test/golden/run.mjs --record [NAME]      Regenerate master(s)
  node test/golden/run.mjs --accept NAME        Promote pending → master
`)
}

async function loadStories(filter) {
  const files = readdirSync(STORIES_DIR).filter(f => f.endsWith('.mjs')).sort()
  const stories = []
  for (const f of files) {
    const mod = await import(resolve(STORIES_DIR, f))
    if (!mod.run || !mod.name) throw new Error(`${f}: missing name or run()`)
    if (filter && mod.name !== filter) continue
    stories.push(mod)
  }
  if (filter && stories.length === 0) throw new Error(`no story named ${filter}`)
  return stories
}

function masterPaths(name) {
  return {
    svg: resolve(MASTERS_DIR, `${name}.svg.canonical`),
    pdf: resolve(MASTERS_DIR, `${name}.pdf.json`),
  }
}

function pendingPaths(name) {
  return {
    svg: resolve(PENDING_DIR, `${name}.svg.canonical`),
    pdf: resolve(PENDING_DIR, `${name}.pdf.json`),
    rawPdf: resolve(PENDING_DIR, `${name}.pdf`),
    rawSvg: resolve(PENDING_DIR, `${name}.svg`),
  }
}

async function runStoryOnce(story, page) {
  const helpers = makeHelpers(page)
  const out = await story.run(page, helpers)
  if (!out || !out.svg || !out.pdf) {
    throw new Error(`${story.name}: run() must return { svg, pdf }`)
  }
  return out
}

async function record(story, page) {
  const out = await runStoryOnce(story, page)
  // Dump raw outputs alongside canonical so a parser error on canonicalize
  // doesn't hide the data — we can still inspect what the app emitted.
  const p = pendingPaths(story.name)
  writeFileSync(p.rawSvg, out.svg)
  writeFileSync(p.rawPdf, Buffer.from(out.pdf))
  const svgCanonical = canonicalizeSvg(out.svg)
  const pdfCanonical = await canonicalizePdf(out.pdf)
  const { svg, pdf } = masterPaths(story.name)
  writeFileSync(svg, svgCanonical)
  writeFileSync(pdf, pdfCanonical)
  // Report byte size (utf-8) rather than String.length (utf-16 units) so
  // numbers line up with what `wc -c` shows on disk.
  const svgBytes = Buffer.byteLength(svgCanonical, 'utf8')
  const pdfBytes = Buffer.byteLength(pdfCanonical, 'utf8')
  console.log(`  ✓ recorded ${story.name} (svg=${svgBytes}B, pdf-json=${pdfBytes}B)`)
}

async function verify(story, page) {
  const { svg: svgMasterPath, pdf: pdfMasterPath } = masterPaths(story.name)
  if (!existsSync(svgMasterPath) || !existsSync(pdfMasterPath)) {
    console.log(`  ⚠ ${story.name}: no master — run --record ${story.name} first`)
    return { ok: false, reason: 'no-master' }
  }
  const out = await runStoryOnce(story, page)
  // pdfjs.getDocument transfers ownership of the data buffer (the
  // backing ArrayBuffer is detached after the load resolves), so any
  // post-canonicalize writeFileSync on out.pdf would land 0 bytes.
  // Snapshot the bytes upfront — small cost, avoids the detached-buffer
  // pitfall when triaging gate drift.
  const rawPdfBytes = Buffer.from(out.pdf)
  const svgCanonical = canonicalizeSvg(out.svg)
  const pdfCanonical = await canonicalizePdf(out.pdf)
  const svgMaster = readFileSync(svgMasterPath, 'utf8')
  const pdfMaster = readFileSync(pdfMasterPath, 'utf8')
  const svgOk = svgCanonical === svgMaster
  const pdfOk = pdfCanonical === pdfMaster
  if (svgOk && pdfOk) {
    console.log(`  ✓ ${story.name}`)
    return { ok: true }
  }
  // Mismatch: dump pending
  const p = pendingPaths(story.name)
  writeFileSync(p.svg, svgCanonical)
  writeFileSync(p.pdf, pdfCanonical)
  writeFileSync(p.rawSvg, out.svg)
  writeFileSync(p.rawPdf, rawPdfBytes)
  console.error(`  ✗ ${story.name}${svgOk ? '' : ' SVG'}${pdfOk ? '' : ' PDF'} drift`)
  console.error(`      master : ${svgMasterPath}`)
  console.error(`      pending: ${p.svg}`)
  console.error(`      master : ${pdfMasterPath}`)
  console.error(`      pending: ${p.pdf}`)
  if (!svgOk) {
    // Print first line-level diff for quick orientation
    printFirstDiff(svgMaster, svgCanonical, 'SVG')
  }
  if (!pdfOk) {
    printFirstDiff(pdfMaster, pdfCanonical, 'PDF-json')
  }
  return { ok: false, reason: 'drift' }
}

function printFirstDiff(a, b, label) {
  const aL = a.split('\n')
  const bL = b.split('\n')
  for (let i = 0; i < Math.max(aL.length, bL.length); i++) {
    if (aL[i] !== bL[i]) {
      console.error(`      ${label} first diff @ line ${i + 1}:`)
      console.error(`         - ${(aL[i] ?? '').slice(0, 200)}`)
      console.error(`         + ${(bL[i] ?? '').slice(0, 200)}`)
      return
    }
  }
}

function accept(name) {
  const p = pendingPaths(name)
  const m = masterPaths(name)
  if (!existsSync(p.svg) || !existsSync(p.pdf)) {
    console.error(`no pending output for ${name} (run --only ${name} to produce one)`)
    process.exit(1)
  }
  renameSync(p.svg, m.svg)
  renameSync(p.pdf, m.pdf)
  console.log(`✓ promoted pending → master for ${name}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'help') { help(); return }
  if (args.mode === 'accept') { accept(args.name); return }

  const stories = await loadStories(args.name)
  const server = await ensureDevServer()
  const browser = await launchBrowser()
  let failures = 0
  try {
    for (const story of stories) {
      console.log(`─── ${story.name} ───`)
      const page = await openPage(browser)
      try {
        if (args.mode === 'record') await record(story, page)
        else {
          const r = await verify(story, page)
          if (!r.ok) failures++
        }
      } catch (err) {
        console.error(`  ✗ ${story.name} threw: ${err.message}`)
        failures++
      } finally {
        await page.context().close().catch(() => {})
      }
    }
  } finally {
    await browser.close().catch(() => {})
    if (server.started && server.child) {
      server.child.kill('SIGTERM')
    }
  }
  if (failures) {
    console.error(`\n${failures} failure(s)`)
    process.exit(1)
  }
  console.log(`\nAll green.`)
}

main().catch((err) => { console.error(err); process.exit(2) })
