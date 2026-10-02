#include "../common/spun.h"
#include "screen.h"

void clip_write(uint8_t *clip) __z88dk_fastcall {
    uint8_t index;

    ZXN_NEXTREG(0x1C, 0x01);
    for(index = 0; index != 4; index++) ZXN_NEXTREGA(0x18, clip[index]);
}
