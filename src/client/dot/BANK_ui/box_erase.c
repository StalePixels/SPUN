#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

void box_erase(uint8_t top, uint8_t rows) {
    uint8_t *pixel;
    uint8_t line;

    for(; rows; rows--, top++) {
        pixel = zx_cxy2saddr(BOX_LEFT, top);
        for(line = 0; line != 8; line++, pixel += 256) memset(pixel, 0, BOX_WIDTH);
        memset(zx_cxy2aaddr(BOX_LEFT, top), 0, BOX_WIDTH);
    }
}
