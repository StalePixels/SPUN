#include "../common/spun.h"
#include "gui.h"

// NextZXOS may have changed the tile area since it had it back, so its contents are kept again.
// The tile definitions and the tilemap are the caller's to write
void os_take(void) {
    im2_on();
    tiles_take();
}
