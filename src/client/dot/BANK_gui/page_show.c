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
    tm_text(1, STATUS_ROW, (const unsigned char *)"Loading", ATTR_TEXT);

    intrinsic_di();
    pointer_hide();
    error = _farWithPointer(BANK_NET, categoriesShown ? (far_ptr_fn_t)gui_categories : (far_ptr_fn_t)page_request, searchText);
    intrinsic_ei();

    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(error) {
        message_show(error);
        buttons_show();
        return;
    }

    if(categoriesShown) {
        tm_text(COL_ID, HEAD_ROW, (const unsigned char *)"Category", ATTR_KEY);
        tm_text(COL_ID, row++, (const unsigned char *)"All", ATTR_TEXT);
        while(row != LIST_ROW + 1 + LIST_ROWS && _far(BANK_NET, (far_fn_t)gui_next_category)) tm_text(COL_ID, row++, entryName, ATTR_TEXT);
    } else {
        tm_text(COL_ID, HEAD_ROW, (const unsigned char *)"App    Title                            Publisher        Version     Downloads", ATTR_KEY);
        while(row != LIST_ROW + LIST_ROWS && _far(BANK_NET, (far_fn_t)reply_next_app)) entry_draw(row++);
    }
    listCount = row - LIST_ROW;
    if(listSel >= listCount) listSel = listCount ? listCount - 1 : 0;
    list_select(listSel);
    status_show();
    buttons_show();
}
