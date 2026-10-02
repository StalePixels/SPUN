#include "../common/spun.h"
#include "gui.h"

bool guiOpen;

// The tile area of bank 5 holds NextZXOS's data, and the tilemap goes there. It is
// changed only while IM2 is on, so NextZXOS's own interrupt never sees it changed
void gui_open(void) {
    gui_alloc();
    sprites_load();
    im2_save();
    gui_resume();
}
