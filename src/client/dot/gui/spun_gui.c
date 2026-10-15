#include "../common/spun.h"
#include "gui.h"
#include "../BANK_gui/run.h"
#include "../BANK_screen/screen.h"
#include "../BANK_packages/catalogue.h"
#include "../BANK_packages/install.h"

unsigned char searchText[SEARCH_LENGTH + 1];

void spun_gui(void) {
    bool splashOn = !quiet;

    quiet = true;
    if(_farWithPointer(BANK_PACKAGES, (far_ptr_fn_t)check_catalogue, NULL)) {
        updateCount = (uint16_t)_far(BANK_PACKAGES, (far_fn_t)updates_count);
    }
    gui_open();
    if(splashOn) _far(BANK_SCREEN, (far_fn_t)splash);
    _far(BANK_GUI, (far_fn_t)gui_run);
    gui_close();
}
