#!/usr/bin/env python3
"""
SVG Benchmark Comparison — structural parse, no vision/PNG.
Compares reference SVGs against vectorfeld recreations element-by-element.
"""
import xml.etree.ElementTree as ET
import re
import sys
import os

NS = {'svg': 'http://www.w3.org/2000/svg'}

def parse_svg_elements(filepath):
    """Extract drawing elements from SVG, ignoring metadata/text/frames."""
    tree = ET.parse(filepath)
    root = tree.getroot()

    elements = []
    # Walk all elements
    for elem in root.iter():
        tag = elem.tag.replace('{http://www.w3.org/2000/svg}', '')
        if tag in ('rect', 'path', 'ellipse', 'line', 'circle', 'polygon', 'polyline'):
            attrs = dict(elem.attrib)
            # Skip test-frame and marker rects (4x4 blue squares)
            if attrs.get('id') == 'test-frame':
                continue
            if tag == 'rect' and attrs.get('width') == '4' and attrs.get('height') == '4':
                continue  # marker squares in paths-data-01
            elements.append({'tag': tag, 'attrs': attrs})
    return elements


def color_equiv(c1, c2):
    """Check if two SVG color values are equivalent."""
    if c1 is None and c2 is None:
        return True
    if c1 is None or c2 is None:
        return False

    # Normalize
    c1 = c1.strip().lower()
    c2 = c2.strip().lower()

    # Named color map (subset)
    names = {
        'blue': '#0000ff', 'green': '#008000', 'red': '#ff0000',
        'fuchsia': '#ff00ff', 'magenta': '#ff00ff',
        'black': '#000000', 'white': '#ffffff',
        'none': 'none',
    }
    c1 = names.get(c1, c1)
    c2 = names.get(c2, c2)
    return c1 == c2


def compare_rects(ref, vf, scale_x, scale_y):
    """Compare two rect elements, accounting for coordinate scaling."""
    results = []

    # Compare fill
    rf = ref.get('fill', 'black')
    vff = vf.get('fill', 'black')
    if color_equiv(rf, vff):
        results.append(('fill', 'PASS', f'{rf} == {vff}'))
    else:
        results.append(('fill', 'FAIL', f'ref={rf} vf={vff}'))

    # Compare stroke
    rs = ref.get('stroke', 'none')
    vs = vf.get('stroke', 'none')
    if color_equiv(rs, vs):
        results.append(('stroke', 'PASS', f'{rs} == {vs}'))
    else:
        results.append(('stroke', 'FAIL', f'ref={rs} vf={vs}'))

    # Compare stroke-width (scaled)
    rsw = ref.get('stroke-width')
    vsw = vf.get('stroke-width')
    if rsw and vsw:
        ref_sw = float(rsw) * scale_x  # scale stroke-width
        vf_sw = float(vsw)
        if abs(ref_sw - vf_sw) / max(ref_sw, 0.1) < 0.15:
            results.append(('stroke-width', 'PASS', f'ref={rsw}*{scale_x:.3f}={ref_sw:.1f} vf={vsw}'))
        else:
            results.append(('stroke-width', 'FAIL', f'ref={rsw}*{scale_x:.3f}={ref_sw:.1f} vf={vsw}'))
    elif rsw and not vsw:
        results.append(('stroke-width', 'FAIL', f'ref={rsw} vf=missing'))
    elif not rsw and vsw and vsw != '1':
        results.append(('stroke-width', 'FAIL', f'ref=default vf={vsw}'))
    else:
        results.append(('stroke-width', 'PASS', 'both default'))

    # Compare rx/ry presence and relative proportion
    for attr in ('rx', 'ry'):
        rv = ref.get(attr)
        vv = vf.get(attr)
        if rv and vv:
            # Check that rx/ry is present (exact value differs due to scaling)
            results.append((attr, 'PASS', f'ref={rv} vf={vv} (both present)'))
        elif rv and not vv:
            results.append((attr, 'FAIL', f'ref={rv} vf=missing'))
        elif not rv and vv:
            results.append((attr, 'FAIL', f'ref=none vf={vv}'))
        else:
            results.append((attr, 'PASS', 'neither has ' + attr))

    # Compare position (scaled)
    for attr in ('x', 'y', 'width', 'height'):
        rv = ref.get(attr)
        vv = vf.get(attr)
        if rv and vv:
            scale = scale_x if attr in ('x', 'width') else scale_y
            ref_val = float(rv) * scale
            vf_val = float(vv)
            tol = max(abs(ref_val) * 0.05, 2.0)  # 5% or 2mm tolerance
            if abs(ref_val - vf_val) < tol:
                results.append((attr, 'PASS', f'ref={rv}*{scale:.3f}={ref_val:.1f} vf={vf_val:.1f} (delta={abs(ref_val-vf_val):.1f})'))
            else:
                results.append((attr, 'FAIL', f'ref={rv}*{scale:.3f}={ref_val:.1f} vf={vf_val:.1f} (delta={abs(ref_val-vf_val):.1f})'))

    return results


def parse_path_commands(d):
    """Parse SVG path d attribute into command list."""
    if not d:
        return []
    # Tokenize
    commands = []
    tokens = re.findall(r'[MmLlCcSsQqTtAaZz]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?', d)
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            args = []
            while i < len(tokens) and not tokens[i].isalpha():
                args.append(float(tokens[i]))
                i += 1
            commands.append((cmd, args))
        else:
            i += 1
    return commands


def compare_benchmark(name, ref_file, vf_file, scale_x, scale_y):
    """Compare a single benchmark."""
    print(f'\n{"="*70}')
    print(f'BENCHMARK: {name}')
    print(f'  Reference: {os.path.basename(ref_file)}')
    print(f'  Vectorfeld: {os.path.basename(vf_file)}')
    print(f'  Scale: x={scale_x:.4f} y={scale_y:.4f}')
    print(f'{"="*70}')

    ref_els = parse_svg_elements(ref_file)
    vf_els = parse_svg_elements(vf_file)

    # Filter out text elements from reference (vectorfeld doesn't have text tool for labels)
    ref_drawing = [e for e in ref_els if e['tag'] != 'text']

    print(f'\n  Element count: ref={len(ref_drawing)} vf={len(vf_els)}')

    if len(ref_drawing) != len(vf_els):
        print(f'  COUNT MISMATCH: FAIL')
        print(f'    Reference elements: {[e["tag"] for e in ref_drawing]}')
        print(f'    Vectorfeld elements: {[e["tag"] for e in vf_els]}')

    total_pass = 0
    total_fail = 0

    for i in range(min(len(ref_drawing), len(vf_els))):
        ref_el = ref_drawing[i]
        vf_el = vf_els[i]

        ref_id = ref_el['attrs'].get('id', f'#{i+1}')
        vf_id = vf_el['attrs'].get('id', f'#{i+1}')

        print(f'\n  --- Element {i+1}: ref={ref_el["tag"]}#{ref_id} vs vf={vf_el["tag"]}#{vf_id} ---')

        # Tag match
        if ref_el['tag'] != vf_el['tag']:
            print(f'    TAG MISMATCH: FAIL (ref={ref_el["tag"]} vf={vf_el["tag"]})')
            total_fail += 1
            continue

        if ref_el['tag'] == 'rect':
            results = compare_rects(ref_el['attrs'], vf_el['attrs'], scale_x, scale_y)
            for attr, status, detail in results:
                symbol = 'PASS' if status == 'PASS' else 'FAIL'
                print(f'    {attr:15s} {symbol}  {detail}')
                if status == 'PASS':
                    total_pass += 1
                else:
                    total_fail += 1

        elif ref_el['tag'] == 'path':
            ref_d = ref_el['attrs'].get('d', '')
            vf_d = vf_el['attrs'].get('d', '')
            ref_cmds = parse_path_commands(ref_d)
            vf_cmds = parse_path_commands(vf_d)

            print(f'    ref commands: {[c[0] for c in ref_cmds]}')
            print(f'    vf  commands: {[c[0] for c in vf_cmds]}')

            # Compare command types
            ref_types = [c[0] for c in ref_cmds]
            vf_types = [c[0] for c in vf_cmds]

            if ref_types == vf_types:
                print(f'    command-types   PASS  exact match')
                total_pass += 1
            else:
                print(f'    command-types   FAIL  ref={ref_types} vf={vf_types}')
                total_fail += 1

            # Compare fill/stroke
            for attr in ('fill', 'stroke'):
                rv = ref_el['attrs'].get(attr)
                vv = vf_el['attrs'].get(attr)
                if color_equiv(rv, vv):
                    print(f'    {attr:15s} PASS  {rv} == {vv}')
                    total_pass += 1
                else:
                    print(f'    {attr:15s} FAIL  ref={rv} vf={vv}')
                    total_fail += 1

    # Report elements only in one side
    if len(ref_drawing) > len(vf_els):
        for i in range(len(vf_els), len(ref_drawing)):
            el = ref_drawing[i]
            print(f'\n  --- Element {i+1}: MISSING in vectorfeld ---')
            print(f'    ref={el["tag"]}#{el["attrs"].get("id", "?")} fill={el["attrs"].get("fill")} stroke={el["attrs"].get("stroke")}')
            total_fail += 1

    print(f'\n  SUMMARY: {total_pass} PASS, {total_fail} FAIL')
    return total_pass, total_fail


def main():
    base = '/home/tobias/Projects/vectorfeld/test-benchmarks'

    # Coordinate scaling: reference viewBox 480x360 -> vectorfeld 210x297mm
    scale_x = 210 / 480  # 0.4375
    scale_y = 297 / 360  # 0.825

    grand_pass = 0
    grand_fail = 0

    # Benchmark 1: painting-stroke-01
    p, f = compare_benchmark(
        'painting-stroke-01 (2 rects: blue fill, green stroke)',
        os.path.join(base, 'painting-stroke-01.svg'),
        os.path.join(base, 'painting-stroke-01-VECTORFELD.svg'),
        scale_x, scale_y
    )
    grand_pass += p
    grand_fail += f

    # Benchmark 2: shapes-rect-01
    p, f = compare_benchmark(
        'shapes-rect-01 (8 rects: fill/stroke/rounded corners)',
        os.path.join(base, 'shapes-rect-01.svg'),
        os.path.join(base, 'shapes-rect-01-VECTORFELD.svg'),
        scale_x, scale_y
    )
    grand_pass += p
    grand_fail += f

    # Benchmark 3: paths-data-01
    p, f = compare_benchmark(
        'paths-data-01 (8 bezier paths: C/S/c/s commands)',
        os.path.join(base, 'paths-data-01.svg'),
        os.path.join(base, 'paths-data-01-VECTORFELD.svg'),
        scale_x, scale_y
    )
    grand_pass += p
    grand_fail += f

    print(f'\n{"="*70}')
    print(f'GRAND TOTAL: {grand_pass} PASS, {grand_fail} FAIL')
    print(f'{"="*70}')


if __name__ == '__main__':
    main()
