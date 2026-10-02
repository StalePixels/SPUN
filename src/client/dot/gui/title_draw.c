#include "../common/spun.h"
#include "gui.h"

void title_draw(void) {
    tm_blank(0, TITLE_ROW, GUI_COLUMNS, ATTR_BAR);
    tm_text(1, TITLE_ROW, (unsigned char *)"SPUN", ATTR_BAR);
}
