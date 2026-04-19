// Web Worker that runs MuPDF WASM off the main thread.
// Receives an ArrayBuffer + page index, posts back a rendered SVG string.
//
// Vite picks up the `.worker.ts` suffix via the `?worker` import protocol in
// the caller (pdfImport.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mupdf: any = null

async function getMuPDF() {
  if (mupdf) return mupdf
  mupdf = await import('mupdf')
  return mupdf
}

async function renderPageToSvg(pdfData: ArrayBuffer, pageIndex: number): Promise<string> {
  const m = await getMuPDF()
  const doc = m.Document.openDocument(pdfData, 'application/pdf')
  try {
    const page = doc.loadPage(pageIndex)
    try {
      const bounds = page.getBounds()
      const buf = new m.Buffer()
      const writer = new m.DocumentWriter(buf, 'svg', 'text=text')
      const device = writer.beginPage(bounds)
      page.run(device, m.Matrix.identity)
      writer.endPage()
      writer.close()
      return buf.asString()
    } finally {
      page.destroy()
    }
  } finally {
    doc.destroy()
  }
}

type RenderRequest = {
  kind: 'render'
  id: number
  pdf: ArrayBuffer
  pageIndex: number
}

type RenderResponse =
  | { kind: 'rendered'; id: number; svg: string }
  | { kind: 'error'; id: number; message: string }

self.addEventListener('message', async (e: MessageEvent<RenderRequest>) => {
  const msg = e.data
  if (msg?.kind !== 'render') return
  try {
    const svg = await renderPageToSvg(msg.pdf, msg.pageIndex)
    const resp: RenderResponse = { kind: 'rendered', id: msg.id, svg }
    ;(self as unknown as Worker).postMessage(resp)
  } catch (err) {
    const resp: RenderResponse = {
      kind: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(resp)
  }
})

export {}
