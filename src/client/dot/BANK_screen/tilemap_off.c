#include "../common/spun.h"
#include "screen.h"

// The ULA is zeroed and transparent as well, so everything behind Layer 2 is the fallback colour, black
void tilemap_off(void) {
    ZXN_NEXTREG(0x6B, 0x48);
}
