#include "../common/spun.h"
#include "gui.h"

unsigned char *tm_text(uint8_t col, uint8_t row, unsigned char *text, uint8_t attr) {
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t *cell = (uint8_t *)0x6C00 + (row * GUI_COLUMNS + col) * 2;

    ZXN_WRITE_MMU3(11);
    while(*text && *text != '\n') {
        *cell++ = *text++;
        *cell++ = attr;
    }
    ZXN_WRITE_MMU3(mmu3);
    return text;
}
