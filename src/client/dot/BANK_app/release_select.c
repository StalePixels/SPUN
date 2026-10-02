#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

void release_select(uint8_t sel) __z88dk_fastcall {
    tm_attr(REL_BAR_COL, REL_ROW + relSel - relTop, REL_BAR_WIDTH, ATTR_TEXT);
    relSel = sel;
    if(relSel < relTop || relSel >= relTop + REL_ROWS) {
        relTop = relSel < relTop ? relSel : relSel - REL_ROWS + 1;
        releases_draw();
        return;
    }
    tm_attr(REL_BAR_COL, REL_ROW + relSel - relTop, REL_BAR_WIDTH, ATTR_BAR);
}
