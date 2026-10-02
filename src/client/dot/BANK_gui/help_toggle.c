#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

bool helpShown;

// The help goes over the list, and the GUI keeps no copy of the list, so hiding the help asks the server again
void help_toggle(void) {
    unsigned char *line = help;
    uint8_t row = HEAD_ROW;

    if(helpShown) {
        page_show();
        return;
    }

    helpShown = true;
    listCount = 0;
    tm_blank(0, HEAD_ROW, GUI_COLUMNS * (STATUS_ROW - HEAD_ROW), ATTR_TEXT);
    while(*line && row != STATUS_ROW) {
        line = tm_text(2, row++, line, ATTR_TEXT);
        if(*line) line++;
    }
}
