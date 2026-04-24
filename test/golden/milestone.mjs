// Golden-master MILESTONE runner.
//
// DIFFERENT FROM THE GATE RUNNER (run.mjs):
//
// Gates (run.mjs, `npm run golden`):
//   - Block commits when red
//   - App output compared against its own deterministic masters
//   - Strict byte-match on canonical form
//
// Milestones (this file, `npm run golden:milestones`):
//   - NEVER block — always exit 0
//   - Target fixtures are EXTERNAL SVGs committed under milestones/fixtures/
//   - Driver scripts under milestones/drivers/ must use specific TOOL
//     COMBINATIONS to recreate them (e.g. rect + select + free-transform
//     rotate). The combo is the point; the file is the artifact.
//   - Semantic canonicalization (shape→path, hex colors, app-chrome strip)
//     equates visually-identical but serialization-different outputs.
//   - Scoreboard output — three states per milestone:
//       ✓  matched (the combo works end-to-end)
//       ✗  drift   (the combo produced output, didn't match target)
//       —  gap     (combo couldn't execute — missing feature / UI broken)
//
// Milestones are a progress measure, not a correctness gate. Red entries
// are inputs to the bug / feature backlog, not merge blockers.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDevServer, launchBrowser, openPage, makeHelpers } from './harness.mjs'
import { semanticCanonicalSvg } from './semanticCanonical.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DRIVERS_DIR = resolve(here, 'milestones', 'drivers')
const FIXTURES_DIR = resolve(here, 'milestones', 'fixtures')
const PENDING_DIR = resolve(here, 'pending')
if (!existsSync(PENDING_DIR)) mkdirSync(PENDING_DIR, { recursive: true })

function parseArgs(argv) {
  const args = { only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only') args.only = argv[++i]
  }
  return args
}

async function loadDrivers(filter) {
  const files = readdirSync(DRIVERS_DIR).filter(f => f.endsWith('.mjs')).sort()
  const drivers = []
  for (const f of files) {
    const mod = await import(resolve(DRIVERS_DIR, f))
    if (!mod.run || !mod.name || !mod.target) {
      throw new Error(`${f}: must export name, target, run()`)
    }
    if (filter && mod.name !== filter) continue
    drivers.push(mod)
  }
  return drivers
}

function firstDiffLine(a, b) {
  const aL = a.split('\n')
  const bL = b.split('\n')
  for (let i = 0; i < Math.max(aL.length, bL.length); i++) {
    if (aL[i] !== bL[i]) {
      return { line: i + 1, minus: (aL[i] || '').slice(0, 180), plus: (bL[i] || '').slice(0, 180) }
    }
  }
  return null
}

async function runMilestone(driver, page) {
  const helpers = makeHelpers(page)
  const targetPath = resolve(FIXTURES_DIR, driver.target)
  if (!existsSync(targetPath)) {
    return { state: '—', reason: `fixture missing: ${driver.target}` }
  }
  const targetRaw = readFileSync(targetPath, 'utf8')
  const targetCanonical = semanticCanonicalSvg(targetRaw)

  let out
  try {
    out = await driver.run(page, helpers)
  } catch (err) {
    return { state: '—', reason: `driver failed: ${err.message}` }
  }
  if (!out || !out.svg) {
    return { state: '—', reason: `driver returned no svg` }
  }
  // Always dump the raw app output so a canonicalizer exception doesn't
  // hide the underlying data — we can still inspect the SVG the app emitted.
  const safeName = driver.name.replace(/[^a-z0-9-]/gi, '_')
  writeFileSync(resolve(PENDING_DIR, `milestone-${safeName}-actual-raw.svg`), out.svg)
  let actualCanonical
  try {
    actualCanonical = semanticCanonicalSvg(out.svg)
  } catch (err) {
    return { state: '—', reason: `canonicalize threw: ${err.message} — see pending/milestone-${safeName}-actual-raw.svg` }
  }
  if (actualCanonical === targetCanonical) {
    return { state: '✓' }
  }
  writeFileSync(resolve(PENDING_DIR, `milestone-${safeName}-target.svg`), targetCanonical)
  writeFileSync(resolve(PENDING_DIR, `milestone-${safeName}-actual.svg`), actualCanonical)
  return {
    state: '✗',
    reason: `drift — pending/milestone-${safeName}-{target,actual}.svg`,
    firstDiff: firstDiffLine(targetCanonical, actualCanonical),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const drivers = await loadDrivers(args.only)
  if (drivers.length === 0) {
    console.log('No milestones found.')
    return
  }

  const server = await ensureDevServer()
  const browser = await launchBrowser()
  const results = []
  try {
    for (const d of drivers) {
      const page = await openPage(browser)
      try {
        const r = await runMilestone(d, page)
        results.push({ name: d.name, combo: d.combo || '', ...r })
      } finally {
        await page.context().close().catch(() => {})
      }
    }
  } finally {
    await browser.close().catch(() => {})
    if (server.started && server.child) server.child.kill('SIGTERM')
  }

  // ---- Scoreboard ----
  console.log(`\nMilestones (${results.length} target${results.length === 1 ? '' : 's'}):`)
  for (const r of results) {
    const icon = r.state
    const combo = r.combo ? `  [${r.combo}]` : ''
    const reason = r.reason ? ` (${r.reason})` : ''
    console.log(`  ${icon}  ${r.name.padEnd(28)}${combo}${reason}`)
    if (r.firstDiff) {
      console.log(`        first diff @ line ${r.firstDiff.line}:`)
      console.log(`          - ${r.firstDiff.minus}`)
      console.log(`          + ${r.firstDiff.plus}`)
    }
  }
  const ok = results.filter(r => r.state === '✓').length
  const drift = results.filter(r => r.state === '✗').length
  const gap = results.filter(r => r.state === '—').length
  console.log(`\n${ok}/${results.length} achieved · ${drift} drift (bug) · ${gap} gap (feature)\n`)
  // Always exit 0 — milestones never block.
}

main().catch((err) => { console.error(err); process.exit(2) })
