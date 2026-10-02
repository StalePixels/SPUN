#include "../common/spun.h"
#include "gui.h"

// Runs in any state the GUI can be in: open, in os_call or suspended. An exit can come with interrupts off
void gui_close(void) {
    gui_suspend();
    gui_free();
    intrinsic_ei();
}
