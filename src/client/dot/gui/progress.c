#include "../common/spun.h"
#include "gui.h"

// Called between blocks and between files, with interrupts off
void progress(uint8_t stage, uint16_t done, uint16_t total, unsigned char *name) {
    unsigned char line[GUI_COLUMNS];
    uint8_t length;

    if(!guiOpen) return;
    if(stage == PROGRESS_UNZIP) sprintf(line, "Unzipping file %u of %u: ", done, total);
    else sprintf(line, "Downloading block %u of %u: ", done, total);
    length = strlen(line);
    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    tm_text(1, STATUS_ROW, line, ATTR_TEXT);
    tm_cut(1 + length, STATUS_ROW, name, GUI_COLUMNS - 2 - length, ATTR_TEXT);
}
