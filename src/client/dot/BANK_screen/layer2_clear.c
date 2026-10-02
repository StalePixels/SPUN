#include "../common/spun.h"
#include "../gui/gui.h"
#include "screen.h"

// Through MMU2, which the ISR never uses; the ULA's page goes back after
void layer2_clear(void) {
    uint8_t count;

    for(count = 0; count != LAYER2_PAGES; count++) {
        ZXN_WRITE_MMU2(layer2Page + count);
        memset((void *)0x4000, 0, 0x2000);
    }
    ZXN_WRITE_MMU2(10);
}
