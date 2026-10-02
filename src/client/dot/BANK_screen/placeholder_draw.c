#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "screen.h"

static const unsigned char letters[] = "SPUN";
static const uint8_t colours[] = { 0xE0, 0xFC, 0x1C, 0x1F };

// A 320x256 column is 256 bytes, and an 8K page holds 32 whole columns
void placeholder_draw(struct l2_target *rect) {
    uint8_t glyph[4][8];
    uint8_t mmu2 = ZXN_READ_REG(REG_MMU0 + 2);
    uint8_t scale = (rect->height - 1) / 16;
    uint8_t cell = scale * 8;
    uint8_t across = (rect->width - 2 * cell) / 4;
    uint8_t down = (rect->height - 2 * cell) / 4;
    uint8_t x;
    uint8_t at;
    uint8_t row;
    uint8_t line;
    uint8_t letter;
    uint8_t bit;
    uint8_t colour;
    uint8_t repeat;
    uint16_t col;
    uint8_t *pixel;

    ZXN_WRITE_MMU2(10);
    for(letter = 0; letter != 4; letter++) memcpy(glyph[letter], (uint8_t *)0x5C00 + letters[letter] * 8, 8);

    for(x = 0; x != rect->width; x++) {
        col = rect->x + x;
        ZXN_WRITE_MMU2(layer2Page + (col >> 5));
        pixel = (uint8_t *)0x4000 + ((col & 31) << 8) + rect->y;
        memset(pixel, 0, rect->height);
        if(x >= across && x < across + cell) {
            letter = 0;
            at = x - across;
        } else if(x >= 3 * across + cell && x < 3 * across + 2 * cell) {
            letter = 1;
            at = x - 3 * across - cell;
        } else {
            continue;
        }
        bit = 0x80 >> (at / scale);
        pixel += down;
        for(row = 0; row != 2; row++, letter += 2) {
            for(line = 0; line != 8; line++) {
                colour = glyph[letter][line] & bit ? colours[letter] : 0;
                for(repeat = 0; repeat != scale; repeat++) *pixel++ = colour;
            }
            pixel += 2 * down;
        }
    }
    ZXN_WRITE_MMU2(mmu2);
}
