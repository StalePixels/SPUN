#include "../common/spun.h"
#include "screen.h"

// The clip window's X is in pixels at 256 wide and in pairs of pixels at 320
static uint8_t clip256[] = { 0, 255, 0, 191 };
uint8_t clip320[] = { 0, 159, 0, 255 };

void layer2_on(uint8_t mode) {
    ZXN_NEXTREGA(0x70, mode);
    clip_write(mode ? clip320 : clip256);
    ZXN_NEXTREGA(0x69, ZXN_READ_REG(0x69) | 0x80);
}
