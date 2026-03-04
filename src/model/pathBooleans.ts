/**
 * Path boolean operations via Paper.js (lazy-loaded).
 * Unite, subtract, intersect, exclude, divide two SVG path d strings.
 */

type BooleanOp = 'unite' | 'subtract' | 'intersect' | 'exclude' | 'divide'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let paperModule: any = null

async function getPaper() {
  if (paperModule) return paperModule
  const mod = await import('paper')
  // Paper.js exports differently in ESM vs CJS — handle both
  const paper = mod.default || mod
  // paper may already be a PaperScope; setup if needed
  if (typeof paper.setup === 'function') {
    paper.setup(new paper.Size(1, 1))
    paperModule = paper
  } else if (typeof paper.PaperScope === 'function') {
    paperModule = new paper.PaperScope()
    paperModule.setup(new paper.Size(1, 1))
  } else {
    paperModule = paper
  }
  return paperModule
}

/**
 * Perform a boolean operation on two SVG path d strings.
 * Returns an array of result d strings (divide can produce multiple paths).
 */
export async function pathBoolean(
  d1: string,
  d2: string,
  op: BooleanOp
): Promise<string[]> {
  const paper = await getPaper()
  const path1 = new paper.Path(d1)
  const path2 = new paper.Path(d2)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any
  switch (op) {
    case 'unite':
      result = path1.unite(path2)
      break
    case 'subtract':
      result = path1.subtract(path2)
      break
    case 'intersect':
      result = path1.intersect(path2)
      break
    case 'exclude':
      result = path1.exclude(path2)
      break
    case 'divide':
      result = path1.divide(path2)
      break
  }

  // Extract d strings from result
  const dStrings: string[] = []
  if (result.children && result.children.length > 0) {
    // CompoundPath — iterate children
    for (const child of result.children) {
      const pathData = child.pathData
      if (pathData) dStrings.push(pathData)
    }
  } else if (result.pathData) {
    dStrings.push(result.pathData)
  }

  // Cleanup
  path1.remove()
  path2.remove()
  result.remove()

  return dStrings
}
