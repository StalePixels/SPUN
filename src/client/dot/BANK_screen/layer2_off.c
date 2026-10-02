#include "../common/spun.h"
#include "screen.h"

void layer2_off(void) {
    ZXN_NEXTREGA(0x69, ZXN_READ_REG(0x69) & 0x7F);
}
