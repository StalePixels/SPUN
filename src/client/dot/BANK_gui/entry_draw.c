#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

void entry_draw(uint8_t row) __z88dk_fastcall {
    unsigned char count[11];

    version[VERSION_WIDTH] = 0;
    sprintf(count, "%10lu", (unsigned long)downloads);

    tm_text(COL_ID, row, appid, ATTR_TEXT);
    tm_text(COL_TITLE, row, title, ATTR_TEXT);
    tm_text(COL_USER, row, username, ATTR_TEXT);
    tm_text(COL_VERSION, row, version, ATTR_TEXT);
    tm_text(COL_DOWNLOADS, row, count, ATTR_TEXT);
}
