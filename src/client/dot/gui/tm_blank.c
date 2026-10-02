#include "../common/spun.h"
#include "gui.h"

// The tilemap is at 0x6C00 of bank 5 (NR 0x6E), in page 11, which a block read may have paged out
void tm_blank(uint8_t col, uint8_t row, uint16_t count, uint8_t attr) {
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t *cell = (uint8_t *)0x6C00 + (row * GUI_COLUMNS + col) * 2;

    ZXN_WRITE_MMU3(11);
    while(count--) {
        *cell++ = ' ';
        *cell++ = attr;
    }
    ZXN_WRITE_MMU3(mmu3);
}
