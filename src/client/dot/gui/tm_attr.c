#include "../common/spun.h"
#include "gui.h"

void tm_attr(uint8_t col, uint8_t row, uint8_t count, uint8_t attr) {
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t *cell = (uint8_t *)0x6C01 + (row * GUI_COLUMNS + col) * 2;

    ZXN_WRITE_MMU3(11);
    while(count--) {
        *cell = attr;
        cell += 2;
    }
    ZXN_WRITE_MMU3(mmu3);
}
