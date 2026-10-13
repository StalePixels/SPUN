"""Makes specp437.woff2, the 8x8 font of the .spun GUI, for the SPUN theme.

Characters 32-127 are the Spectrum ROM font, which the GUI copies from ROM 3;
128-255 are src/client/dot/BANK_screen/specp437_128-255.bin. Only the glyphs
of the upper half that are CP437 characters get a Unicode code point.

    uv run --with fonttools --with brotli python specp437.py <48K or NextZXOS ROM>
"""

import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = Path(__file__).parent
UPPER = HERE / "../../../../client/dot/BANK_screen/specp437_128-255.bin"

PIXEL = 128
EM = 8 * PIXEL
ASCENT = 7 * PIXEL
DESCENT = PIXEL

ROM_SPECIAL = {0x5E: 0x2191, 0x60: 0x00A3, 0x7F: 0x00A9}

CP437 = {
    0x80: 0x00C7, 0x81: 0x00FC, 0x82: 0x00E9,
    0xAB: 0x00BD, 0xAC: 0x00BC, 0xAD: 0x00A1, 0xAE: 0x00AB, 0xAF: 0x00BB,
}
CP437.update(zip(range(0xB0, 0xE0), map(ord,
    "░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀")))


def glyph(rows):
    pen = TTGlyphPen(None)
    for y, byte in enumerate(rows):
        top = ASCENT - y * PIXEL
        x = 0
        while x < 8:
            if not byte & (0x80 >> x):
                x += 1
                continue
            start = x
            while x < 8 and byte & (0x80 >> x):
                x += 1
            pen.moveTo((start * PIXEL, top - PIXEL))
            pen.lineTo((start * PIXEL, top))
            pen.lineTo((x * PIXEL, top))
            pen.lineTo((x * PIXEL, top - PIXEL))
            pen.closePath()
    return pen.glyph()


def main(rom_path):
    rom = Path(rom_path).read_bytes()
    lower = rom[-0x4000:][0x3D00:0x4000]
    upper = UPPER.read_bytes()

    chars = {}
    for code in range(0x20, 0x80):
        chars[ROM_SPECIAL.get(code, code)] = lower[(code - 0x20) * 8:][:8]
    for code, unicode in CP437.items():
        chars[unicode] = upper[(code - 0x80) * 8:][:8]

    names = [".notdef"] + [f"uni{u:04X}" for u in sorted(chars)]
    glyphs = {".notdef": glyph(bytes(8))}
    glyphs.update({f"uni{u:04X}": glyph(rows) for u, rows in chars.items()})

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({u: f"uni{u:04X}" for u in chars})
    fb.setupGlyf(glyphs)
    glyf = fb.font["glyf"]
    fb.setupHorizontalMetrics({n: (EM, getattr(glyf[n], "xMin", 0)) for n in names})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
    fb.setupNameTable({"familyName": "specp437", "styleName": "Regular"})
    fb.setupOS2(
        sTypoAscender=ASCENT, sTypoDescender=-DESCENT, sTypoLineGap=0,
        usWinAscent=ASCENT, usWinDescent=DESCENT, xAvgCharWidth=EM,
    )
    fb.setupPost(isFixedPitch=1)
    fb.font.flavor = "woff2"
    fb.save(HERE / "specp437.woff2")


if __name__ == "__main__":
    main(sys.argv[1])
