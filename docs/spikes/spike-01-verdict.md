# Spike 01 — mupdf.js graftPage verdict

Source: `/home/tobias/Projects/vectorfeld/temp/Flyer Swift Vortragscoaching yellow BG bluer Border.pdf`  (2575475 bytes)

## Load
- Source loaded, page count: 1

## Graft
- Empty new PDFDocument created (pages: 0)
- graftPage(-1, srcDoc, 0) completed; new page count: 1

## Save
- Wrote /home/tobias/Projects/vectorfeld/temp/spike-01-graft.pdf (1625272 bytes)

## Text comparison (pdftotext)
- Text identical: **true**

## Page dims (pdfinfo)
- Source: `595.32 x 841.92 pts (A4)`
- Output: `595.32 x 841.92 pts (A4)`
- Dims match: **true**

## Font preservation (pdffonts)

Source fonts:
```
name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
NQVAEI+Calibri-Bold                  CID TrueType      Identity-H       yes yes yes      6  0
VKURMS+Calibri                       CID TrueType      Identity-H       yes yes yes      9  0
BAAAAA+Playfair Display-Italic       CID TrueType      Identity-H       yes yes yes     99  0
CAAAAA+Playfair Display              CID TrueType      Identity-H       yes yes yes    108  0
AMJAEI+TimesNewRomanPSMT             TrueType          WinAnsi          yes yes no      20  0
WBGCAQ+PlayfairDisplay-Medium        TrueType          WinAnsi          yes yes no       5  0
PBSHGE+Calibri                       TrueType          WinAnsi          yes yes no       8  0
IGIWMS+Calibri-Bold                  TrueType          WinAnsi          yes yes no       7  0
ZYQPQK+PlayfairDisplay-Italic        TrueType          WinAnsi          yes yes no      10  0
VSSRMS+PlayfairDisplay-Regular       TrueType          WinAnsi          yes yes no      11  0
```

Output fonts:
```
name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
NQVAEI+Calibri-Bold                  CID TrueType      Identity-H       yes yes yes     10  0
VKURMS+Calibri                       CID TrueType      Identity-H       yes yes yes     18  0
BAAAAA+Playfair Display-Italic       CID TrueType      Identity-H       yes yes yes     26  0
CAAAAA+Playfair Display              CID TrueType      Identity-H       yes yes yes     35  0
AMJAEI+TimesNewRomanPSMT             TrueType          WinAnsi          yes yes no      44  0
WBGCAQ+PlayfairDisplay-Medium        TrueType          WinAnsi          yes yes no      47  0
PBSHGE+Calibri                       TrueType          WinAnsi          yes yes no      50  0
IGIWMS+Calibri-Bold                  TrueType          WinAnsi          yes yes no      53  0
ZYQPQK+PlayfairDisplay-Italic        TrueType          WinAnsi          yes yes no      74  0
VSSRMS+PlayfairDisplay-Regular       TrueType          WinAnsi          yes yes no      81  0
```


## Embedded image check (pdfimages -list)
Source images:
```
page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
--------------------------------------------------------------------------------------------
```

Output images:
```
page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
--------------------------------------------------------------------------------------------
```


## File size
- Source: 2575475  /  Output: 1625272
  (significant bloat vs source = graft is copying more than strictly needed; within 10% = clean)
