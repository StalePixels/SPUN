#include "../common/spun.h"
#include "../gui/gui.h"
#include "screen.h"

const uint8_t screenRegs[SCREEN_REGS] = { 0x15, 0x6B, 0x68, 0x6E, 0x6F, 0x4C, 0x4A, 0x43, 0x12, 0x14, 0x16, 0x17, 0x69, 0x70, 0x71 };
uint8_t screenSaved[SCREEN_REGS];
uint8_t clipSaved[4];
uint8_t paletteSaved[512];

// Pairs of paper and ink for the ATTR_ values in gui.h, in 8-bit colour; 0x02 is the FoaK blue
static const uint8_t palette[] = { 0x02, 0xFF, 0x02, 0xFC, 0xFF, 0x02, 0xFF, 0xE0, 0x00, 0x00 };

// A clip read gives the value at the clip index, and only a write moves the index on, so each value
// is written back as it is read. Black is transparent and the fallback colour, so it looks black either way.
// Sprites over the tilemap over Layer 2: the text-mode tilemap is transparent in NR 0x14's black (ATTR_BLACK)
void screen_on(void) {
    uint16_t index;

    for(index = 0; index != SCREEN_REGS; index++) screenSaved[index] = ZXN_READ_REG(screenRegs[index]);
    ZXN_NEXTREG(0x1C, 0x01);
    for(index = 0; index != 4; index++) {
        clipSaved[index] = ZXN_READ_REG(0x18);
        ZXN_NEXTREGA(0x18, clipSaved[index]);
    }
    ZXN_NEXTREG(0x43, 0x10);
    for(index = 0; index != 256; index++) {
        ZXN_NEXTREGA(0x40, index);
        paletteSaved[index * 2] = ZXN_READ_REG(0x41);
        paletteSaved[index * 2 + 1] = ZXN_READ_REG(0x44);
    }

    font_load();
    tm_blank(0, 0, GUI_COLUMNS * GUI_ROWS, ATTR_TEXT);

    ZXN_NEXTREG(0x43, 0x30);
    ZXN_NEXTREG(0x40, 0);
    for(index = 0; index != sizeof(palette); index++) ZXN_NEXTREGA(0x41, palette[index]);
    palette_default();
    ZXN_NEXTREG(0x4A, 0x00);
    ZXN_NEXTREG(0x14, 0x00);
    ZXN_NEXTREGA(0x12, layer2Page >> 1);
    ZXN_NEXTREG(0x16, 0);
    ZXN_NEXTREG(0x17, 0);
    ZXN_NEXTREG(0x71, 0);
    layer2_off();
    ZXN_NEXTREG(0x4C, 0x0F);
    ZXN_NEXTREG(0x6E, 0x6C);
    ZXN_NEXTREG(0x6F, 0x5C);
    tilemap_on();
    ZXN_NEXTREGA(0x68, screenSaved[SAVED_68] | 0x80);
    ZXN_NEXTREGA(0x15, (screenSaved[SAVED_15] & 0xE0) | 0x0B);
}
