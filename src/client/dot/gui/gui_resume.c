#include "../common/spun.h"
#include "gui.h"
#include "../BANK_screen/screen.h"

void gui_resume(void) {
    os_take();
    _far(BANK_SCREEN, (far_fn_t)screen_on);
    guiOpen = true;
}
