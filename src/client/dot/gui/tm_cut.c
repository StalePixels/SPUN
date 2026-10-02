#include "../common/spun.h"
#include "gui.h"

void tm_cut(uint8_t col, uint8_t row, unsigned char *text, uint8_t width, uint8_t attr) {
    unsigned char line[GUI_COLUMNS + 1];
    uint8_t at = 0;

    while(at != width && text[at] && text[at] != '\n') {
        line[at] = text[at];
        at++;
    }
    line[at] = 0;
    tm_text(col, row, line, attr);
}
