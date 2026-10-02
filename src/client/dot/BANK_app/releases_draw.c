#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// From the SPINFO reply, which is still in the block, starting at relTop
void releases_draw(void) {
    uint8_t skip = relTop;
    uint8_t row = REL_ROW;

    tm_text(REL_COL, REL_HEAD_ROW, (unsigned char *)"Version", ATTR_KEY);
    tm_text(COL_REL_DATE, REL_HEAD_ROW, (unsigned char *)"Date", ATTR_KEY);
    for(; row != REL_ROW + REL_ROWS; row++) tm_blank(REL_BAR_COL, row, REL_BAR_WIDTH, ATTR_TEXT);
    row = REL_ROW;

    _far(BANK_NET, (void *(*)(void))reply_rewind);
    while(skip-- && _far(BANK_NET, (void *(*)(void))gui_next_release));
    while(row != REL_ROW + REL_ROWS && _far(BANK_NET, (void *(*)(void))gui_next_release)) {
        tm_text(REL_COL, row, version, ATTR_TEXT);
        tm_text(COL_REL_DATE, row, date, ATTR_TEXT);
        row++;
    }
    if(releaseRows) tm_attr(REL_BAR_COL, REL_ROW + relSel - relTop, REL_BAR_WIDTH, ATTR_BAR);
}
