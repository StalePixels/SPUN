#include "../common/spun.h"
#include "gui.h"
#include "../BANK_screen/screen.h"

// Before a NextZXOS call that draws its own screen, such as the directory browser. The pages the
// GUI allocated stay, so that gui_resume cannot fail for want of memory
void gui_suspend(void) {
    if(guiOpen) {
        guiOpen = false;
        _far(BANK_SCREEN, (far_fn_t)screen_off);
    }
    os_give();
    pointer_hide();
}
