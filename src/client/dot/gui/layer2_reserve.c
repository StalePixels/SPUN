#include "../common/spun.h"
#include "gui.h"

// Layer 2 shows LAYER2_PAGES pages in a row from a 16K bank (NR 0x12), which the dot loader's
// page by page allocation cannot give, so the run is reserved here, from the top of RAM down
bool layer2_reserve(void) {
    uint8_t total = esx_ide_bank_total(0);
    uint8_t start;
    uint8_t count;

    if(total < LAYER2_PAGES) return false;
    for(start = (total - LAYER2_PAGES) & 0xFE; start; start -= 2) {
        for(count = 0; count != LAYER2_PAGES; count++) {
            if(esx_ide_bank_reserve(0, start + count)) break;
        }
        if(count == LAYER2_PAGES) {
            layer2Page = start;
            return true;
        }
        while(count--) esx_ide_bank_free(0, start + count);
    }
    return false;
}
