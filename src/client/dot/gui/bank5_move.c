#include "../common/spun.h"
#include "gui.h"

// Areas of bank 5, packed one after another from the start of a page from IDE_BANK. Pages 10
// and 11 are mapped at $4000 for it, as a block read may have left its buffer there
void bank5_move(const struct bank5_area *area, uint8_t count, uint8_t page, uint8_t how) {
    uint8_t mmu2 = ZXN_READ_REG(REG_MMU0 + 2);
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t top = ZXN_READ_REG(REG_MMU0 + 7);
    uint8_t *kept = (uint8_t *)0xE000;
    uint8_t *at;
    uint16_t size;
    uint8_t byte;

    ZXN_WRITE_MMU2(10);
    ZXN_WRITE_MMU3(11);
    ZXN_WRITE_MMU7(page);
    for(; count; count--, area++) {
        at = (uint8_t *)area->at;
        size = area->size;
        if(how == BANK5_SAVE) {
            memcpy(kept, at, size);
            kept += size;
        } else if(how == BANK5_LOAD) {
            memcpy(at, kept, size);
            kept += size;
        } else {
            while(size--) {
                byte = *at;
                *at++ = *kept;
                *kept++ = byte;
            }
        }
    }
    ZXN_WRITE_MMU7(top);
    ZXN_WRITE_MMU3(mmu3);
    ZXN_WRITE_MMU2(mmu2);
}
