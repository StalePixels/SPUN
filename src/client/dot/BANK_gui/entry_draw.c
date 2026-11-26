#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/reply.h"
#include "run.h"

void entry_draw(uint8_t row) __z88dk_fastcall {
    strcpy(rowApps[row - LIST_ROW], appid);

    tm_text(COL_ID, row, appid, ATTR_TEXT);
    tm_cut(COL_TITLE, row, title, TITLE_WIDTH, ATTR_TEXT);
    tm_text(COL_USER, row, username, ATTR_TEXT);
    tm_cut(COL_VERSION, row, version, VERSION_WIDTH, ATTR_TEXT);
    tm_text(COL_DATE, row, date, ATTR_TEXT);
}
