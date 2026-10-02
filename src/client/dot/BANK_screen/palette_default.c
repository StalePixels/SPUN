#include "../common/spun.h"
#include "screen.h"

// Colour i at index i; an 8-bit write sets the ninth bit from the two blue bits, as the thumbnails expect
void palette_default(void) {
    uint16_t index;

    ZXN_NEXTREG(0x43, 0x10);
    ZXN_NEXTREG(0x40, 0);
    for(index = 0; index != 256; index++) ZXN_NEXTREGA(0x41, index);
}
