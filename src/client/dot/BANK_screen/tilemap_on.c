#include "../common/spun.h"
#include "screen.h"

void tilemap_on(void) {
    ZXN_NEXTREG(0x6B, 0xC8);
}
