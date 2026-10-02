#include "../common/spun.h"
#include "gui.h"

// The tile area goes back before NextZXOS's IM 1 interrupt does, so that interrupt never sees the tilemap
void os_give(void) {
    if(tiles_give()) im2_off();
}
