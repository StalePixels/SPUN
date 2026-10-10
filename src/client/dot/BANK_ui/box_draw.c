#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

static const uint8_t stripes[] = { 0x42, 0x56, 0x74, 0x65, 0x68 };

static void side_draw(uint8_t x, uint8_t y, uint8_t pixels) {
    uint8_t *pixel = zx_cxy2saddr(x, y);
    uint8_t line;

    for(line = 0; line != 8; line++, pixel += 256) *pixel = pixels;
    *zx_cxy2aaddr(x, y) = ULA_FRAME;
}

void box_draw(unsigned char *title, uint8_t top, uint8_t rows) {
    uint8_t bottom = top + rows - 1;
    uint8_t *pixel;
    uint8_t index;
    uint8_t line;
    uint8_t y;

    memset(zx_cxy2aaddr(BOX_LEFT, top), ULA_BAR, BOX_WIDTH);
    ula_text(BOX_LEFT + 1, top, title);
    for(index = 0; index != sizeof(stripes); index++) {
        *zx_cxy2aaddr(BOX_RIGHT - 5 + index, top) = stripes[index];
        pixel = zx_cxy2saddr(BOX_RIGHT - 5 + index, top);
        for(line = 0; line != 8; line++, pixel += 256) *pixel = (2 << line) - 1;
    }
    for(y = top + 1; y != bottom + 1; y++) {
        side_draw(BOX_LEFT, y, 0x80);
        side_draw(BOX_RIGHT, y, 0x01);
    }
    memset(zx_cxy2saddr(BOX_LEFT, bottom) + 7 * 256, 0xFF, BOX_WIDTH);
    memset(zx_cxy2aaddr(BOX_LEFT, bottom), ULA_FRAME, BOX_WIDTH);
}
