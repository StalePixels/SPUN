#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_app/app.h"
#include "run.h"

// The entry comes from the list reply, which is still in the NBN block. The GUI keeps no
// copy of the list, so the list is asked for again after the app page. True to quit
bool app_open(void) {
    bool quit;

    _farWithPointer(BANK_NET, (void *(*)(void *))gui_app_at, (void *)(uint16_t)listSel);
    quit = _far(BANK_APP, (void *(*)(void))app_run) != NULL;
    if(quit) return true;

    tm_blank(0, TITLE_ROW + 1, GUI_COLUMNS * (BUTTON_ROW - TITLE_ROW - 1), ATTR_TEXT);
    gui_draw();
    page_show();
    return false;
}
