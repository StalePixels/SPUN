#include "../common/spun.h"
#include "gui.h"

// A message ends with bit 7 set on its last letter, the form NextZXOS prints
void message_show(unsigned char *message) __z88dk_fastcall {
    unsigned char line[GUI_COLUMNS];
    uint8_t at = 0;

    do {
        line[at] = message[at] & 0x7F;
    } while(!(message[at++] & 0x80) && at != GUI_COLUMNS - 1);
    line[at] = 0;

    tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_TEXT);
    tm_text(1, STATUS_ROW, line, ATTR_KEY);
}
