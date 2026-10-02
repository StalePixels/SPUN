#include "../common/spun.h"
#include "../gui/gui.h"
#include "screen.h"

void screen_off(void) {
    uint16_t index;

    ZXN_NEXTREG(0x43, 0x10);
    ZXN_NEXTREG(0x40, 0);
    for(index = 0; index != 512; index++) ZXN_NEXTREGA(0x44, paletteSaved[index]);
    clip_write(clipSaved);
    for(index = 0; index != SCREEN_REGS; index++) ZXN_WRITE_REG(screenRegs[index], screenSaved[index]);
}
