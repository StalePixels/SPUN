#include "../common/spun.h"
#include "gui.h"

void pointer_hide(void) {
    z80_outp(0x303B, 0);
    z80_outp(0x57, 0);
    z80_outp(0x57, 0);
    z80_outp(0x57, 0);
    z80_outp(0x57, 0);
}
