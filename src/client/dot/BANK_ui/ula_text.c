#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

// The glyphs are the tile definitions at $5C00, the ROM font for characters 32-127 (BANK_screen/font_load.asm)
void ula_text(uint8_t x, uint8_t y, unsigned char *text) {
    uint8_t *glyph;
    uint8_t *pixel;
    uint8_t line;

    for(; *text; text++, x++) {
        glyph = (uint8_t *)0x5C00 + *text * 8;
        pixel = zx_cxy2saddr(x, y);
        for(line = 0; line != 8; line++, pixel += 256) *pixel = *glyph++;
    }
}
