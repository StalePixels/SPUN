#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "run.h"

// Interrupts stay off for the whole request, rather than im2_off: NextZXOS's own interrupt
// must not run while bank 5 holds the tilemap. The pointer is hidden after that, so the ISR cannot show it again
void page_show(void) {
    unsigned char *error;
    uint8_t row = LIST_ROW;

    helpShown = false;
    listCount = 0;
    tm_blank(0, HEAD_ROW, GUI_COLUMNS * (STATUS_ROW + 1 - HEAD_ROW), ATTR_TEXT);
    tm_text(1, STATUS_ROW, (unsigned char *)"Loading", ATTR_TEXT);

    intrinsic_di();
    pointer_hide();
    error = _farWithPointer(BANK_NET, (void *(*)(void *))page_request, searchText);
    intrinsic_ei();

    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(error) {
        message_show(error);
        return;
    }

    tm_text(COL_ID, HEAD_ROW, (unsigned char *)"App    Title                            Publisher        Version     Downloads", ATTR_KEY);
    while(row != LIST_ROW + LIST_ROWS && _far(BANK_NET, (void *(*)(void))reply_next_app)) entry_draw(row++);
    listCount = row - LIST_ROW;
    if(listSel >= listCount) listSel = listCount ? listCount - 1 : 0;
    list_select(listSel);
    status_show();
}
