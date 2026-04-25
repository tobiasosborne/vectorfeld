# Spike 02 — graftPage + append overlay content stream

## Graft
- Grafted page 0; new page count: 1

## Font dict inspection
- Resources/Font is dict: true
- Font catalog:
  - `C2_0` → NQVAEI+Calibri-Bold (encoding: Identity-H)
  - `C2_1` → VKURMS+Calibri (encoding: Identity-H)
  - `F1` → BAAAAA+Playfair Display-Italic (encoding: Identity-H)
  - `F2` → CAAAAA+Playfair Display (encoding: Identity-H)
  - `TT0` → AMJAEI+TimesNewRomanPSMT (encoding: WinAnsiEncoding)
  - `TT1` → WBGCAQ+PlayfairDisplay-Medium (encoding: WinAnsiEncoding)
  - `TT2` → PBSHGE+Calibri (encoding: WinAnsiEncoding)
  - `TT3` → IGIWMS+Calibri-Bold (encoding: WinAnsiEncoding)
- Chosen font key for overlay: `TT2`

## Overlay content stream
```
q
BT
/TT2 36 Tf
72 60 Td
1 0 0 rg
(Kurzfristige Hilfe) Tj
ET
Q
```

- Added content stream; new indirect: 89
- Page /Contents is: array=true, stream=false, indirect=false
- Pushed overlay ref into existing /Contents array (now length 2)

## Save
- Wrote /home/tobias/Projects/vectorfeld/temp/spike-02-overlay.pdf

## pdftotext extraction
- Source text (`swift` + `LinguistiK`) present: **true**
- Overlay text (`hello spike`) present: **false**

## Screenshot
- /home/tobias/Projects/vectorfeld/temp/spike-02-shots/spike-02-overlay-1.png

## Verdict
**FAIL** — source preserved: true, overlay rendered: false
