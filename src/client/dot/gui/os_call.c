#include "../common/spun.h"
#include "gui.h"

// esxDOS file calls do not need bank 5's tile area back, so the tilemap stays on screen. IM2 stays
// on with interrupts off, as for the network, so NextZXOS's own interrupt never sees the tilemap
void *os_call(uint8_t bank, void *(*fn)(void *), void *data) {
    void *result;

    intrinsic_di();
    pointer_hide();
    result = _farWithPointer(bank, fn, data);
    intrinsic_ei();
    return result;
}
