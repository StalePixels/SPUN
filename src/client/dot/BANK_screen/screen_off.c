#include "../common/spun.h"
#include "../gui/gui.h"
#include "screen.h"

// The border comes back from BORDCR, which ula_store keeps and NextZXOS sets
void screen_off(void) {
    uint8_t mmu2 = ZXN_READ_REG(REG_MMU0 + 2);
    uint16_t index;

    ZXN_NEXTREG(0x43, 0x10);
    ZXN_NEXTREG(0x40, 0);
    for(index = 0; index != 512; index++) ZXN_NEXTREGA(0x44, paletteSaved[index]);
    ZXN_NEXTREG(0x43, 0x00);
    ZXN_NEXTREG(0x40, 0);
    for(index = 0; index != 64; index++) ZXN_NEXTREGA(0x44, ulaPaletteSaved[index]);
    clip_write(clipSaved);
    ZXN_NEXTREG(0x1C, 0x04);
    for(index = 0; index != 4; index++) ZXN_NEXTREGA(0x1A, ulaClipSaved[index]);
    for(index = 0; index != SCREEN_REGS; index++) ZXN_WRITE_REG(screenRegs[index], screenSaved[index]);
    ZXN_WRITE_MMU2(10);
    z80_outp(0xFE, (*(uint8_t *)0x5C48 >> 3) & 7);
    ZXN_WRITE_MMU2(mmu2);
}
