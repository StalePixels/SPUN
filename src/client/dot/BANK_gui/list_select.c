#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

uint8_t listSel;
uint8_t listCount;

void list_select(uint8_t sel) __z88dk_fastcall {
    if(!listCount) return;
    tm_attr(0, LIST_ROW + listSel, GUI_COLUMNS, ATTR_TEXT);
    listSel = sel;
    tm_attr(0, LIST_ROW + listSel, GUI_COLUMNS, ATTR_BAR);
}
