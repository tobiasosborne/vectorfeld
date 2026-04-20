// Web Worker that runs MuPDF WASM off the main thread.
// Receives an ArrayBuffer + page index, posts back a rendered SVG string.
//
// Vite picks up the `.worker.ts` suffix via the `?worker` import protocol in
// the caller (pdfImport.ts). The pure renderPdfPageToSvg lives in
// pdfRender.ts so tests can import it without a worker shim.

import { renderPdfPageToSvg } from './pdfRender'

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
    const svg = await renderPdfPageToSvg(msg.pdf, msg.pageIndex)
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
