#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

// The key that opened the field is still down at first, and input_poll waits for it to go up
void search_run(void) {
    unsigned char text[SEARCH_LENGTH + 1];
    unsigned char *chr;
    uint8_t length = 0;
    unsigned char key;

    *text = 0;
    tm_text(1, INPUT_ROW, (unsigned char *)"Search:", ATTR_TEXT);

    while(1) {
        tm_blank(INPUT_COL, INPUT_ROW, SEARCH_LENGTH + 1, ATTR_BAR);
        tm_text(INPUT_COL, INPUT_ROW, text, ATTR_BAR);
        tm_text(INPUT_COL + length, INPUT_ROW, (unsigned char *)"_", ATTR_BAR_KEY);

        do {
            intrinsic_halt();
            key = input_poll();
        } while(!key || key == INPUT_CLICK);

        if(key == KEY_ENTER || key == KEY_EDIT) break;
        if(key == KEY_DELETE) {
            if(length) text[--length] = 0;
        } else if(key >= ' ' && key < 0x7F && length != SEARCH_LENGTH) {
            text[length++] = key;
            text[length] = 0;
        }
    }

    tm_blank(0, INPUT_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(key == KEY_EDIT) return;

    for(chr = text; *chr == ' '; chr++);
    if(!*chr) *text = 0;
    strcpy(searchText, text);
    page = 1;
    listSel = 0;
    page_show();
}
