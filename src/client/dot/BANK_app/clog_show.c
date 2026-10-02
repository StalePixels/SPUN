#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// The changelog of the selected release, over the app page; Layer 2 is off, so the thumbnails stay in it
void clog_show(void) {
    unsigned char line[GUI_COLUMNS];
    unsigned char *error;

    _farWithPointer(BANK_NET, (void *(*)(void *))gui_release_at, (void *)(uint16_t)relSel);
    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    tm_text(1, STATUS_ROW, (unsigned char *)"Loading", ATTR_TEXT);

    intrinsic_di();
    pointer_hide();
    error = _far(BANK_NET, (void *(*)(void))gui_clog);
    intrinsic_ei();

    _far(BANK_SCREEN, (void *(*)(void))layer2_off);
    tm_blank(0, TITLE_ROW + 1, GUI_COLUMNS * (BUTTON_ROW - TITLE_ROW - 1), ATTR_TEXT);
    buttons_draw(1);
    if(error) {
        message_show(error);
    } else {
        sprintf(line, "Changelog of %s %s, %s", title, version, date);
        tm_text(1, TITLE_ROW + 2, line, ATTR_KEY);
        if(*changelog) text_wrap(changelog, 1, CLOG_ROW, TEXT_WIDTH, CLOG_ROWS);
        else tm_text(1, CLOG_ROW, (unsigned char *)"This release has no changelog.", ATTR_TEXT);
    }
    wait_back();
}
