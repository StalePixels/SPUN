#include "../common/spun.h"
#include "screen.h"

// With the ULA off as well, everything behind Layer 2 is the fallback colour, black
void tilemap_off(void) {
    ZXN_NEXTREG(0x6B, 0x48);
}
