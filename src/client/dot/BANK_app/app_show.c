#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// SPINFO is asked for each time the page is shown: the GUI keeps no copy. The thumbnails are
// in Layer 2, which only the full screen view overwrites, so after a changelog they are not asked for again
bool app_show(bool pictures) __z88dk_fastcall {
    unsigned char *error;

    releaseRows = 0;
    memset(shotWidth, 0, sizeof(shotWidth));
    *categoryText = 0;

    tm_blank(0, TITLE_ROW + 1, GUI_COLUMNS * (BUTTON_ROW - TITLE_ROW - 1), ATTR_TEXT);
    buttons_draw(appButtonCount);
    tm_text(1, STATUS_ROW, (unsigned char *)"Loading", ATTR_TEXT);

    intrinsic_di();
    pointer_hide();
    error = _far(BANK_NET, (void *(*)(void))gui_info);
    intrinsic_ei();

    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(error) {
        message_show(error);
        return false;
    }

    info_draw();
    releases_draw();
    tm_text(1, HINT_ROW, (unsigned char *)"Up/Down: release   ENTER or click: changelog   1-5 or click: picture", ATTR_TEXT);

    if(pictures) _far(BANK_SCREEN, (void *(*)(void))layer2_clear);
    _farWithPointer(BANK_SCREEN, (void *(*)(void *))layer2_on, (void *)LAYER2_320);
    error = thumbs_load(pictures);
    if(error) message_show(error);
    return true;
}
