#!/usr/bin/env python3
"""Checks a dump of the ULA screen (6912 bytes from $4000) at the end of a
MAME test of .spun: only the first ROWS character rows may have pixels set,
and every attribute must be the same, so nothing that the GUI or the NextZXOS
browser drew is left on BASIC's screen.

usage: ula-check.py DUMP ROWS
"""
import sys

data = open(sys.argv[1], 'rb').read()
rows = int(sys.argv[2])
pixels, attrs = data[:6144], data[6144:6912]


def row_of(offset):
    # The ULA's pixel address: third, pixel line in the cell, character row
    third, line, row = offset >> 11, (offset >> 8) & 7, (offset >> 5) & 7
    return third * 8 + row


stray = sorted({row_of(i) for i, b in enumerate(pixels) if b and row_of(i) >= rows})
colours = sorted(set(attrs))
ok = not stray and len(colours) == 1
print(f'ula       pixels only in rows 0-{rows - 1}: {"yes" if not stray else "no, also in rows " + str(stray)}; '
      f'attributes {" ".join(f"{c:02x}" for c in colours)} {"MATCH" if ok else "DIFFERENT"}')
sys.exit(0 if ok else 1)
