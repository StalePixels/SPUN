#include "../common/spun.h"
#include "gui.h"
#include "../BANK_gui/run.h"
#include "../BANK_packages/catalogue.h"
#include "../BANK_packages/install.h"

unsigned char searchText[SEARCH_LENGTH + 1];

void spun_gui(void) {
    quiet = true;
    if(_farWithPointer(BANK_PACKAGES, (void *(*)(void *))check_catalogue, NULL)) {
        updateCount = (uint16_t)_far(BANK_PACKAGES, (void *(*)(void))updates_count);
    }
    gui_open();
    _far(BANK_GUI, (void *(*)(void))gui_run);
    gui_close();
}
