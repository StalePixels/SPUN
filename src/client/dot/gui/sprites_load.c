#include "../common/spun.h"
#include "gui.h"

// Before im2_on: the pointer interrupt selects sprite slot 0, which moves the pattern upload
void sprites_load(void) {
    uint8_t bottom = ZXN_READ_REG(REG_MMU0 + 6);
    uint8_t top = ZXN_READ_REG(REG_MMU0 + 7);
    uint8_t *pattern = (uint8_t *)0xC000;
    uint16_t count;

    ZXN_WRITE_MMU6(_z_page_table[BANK_SPRITES]);
    ZXN_WRITE_MMU7(_z_page_table[BANK_SPRITES + 1]);
    z80_outp(0x303B, 0);
    for(count = 0; count != 0x4000; count++) z80_outp(0x5B, *pattern++);
    ZXN_WRITE_MMU6(bottom);
    ZXN_WRITE_MMU7(top);
}
