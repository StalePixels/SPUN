#include "../common/spun.h"
#include "gui.h"

void button_draw(const struct gui_button *button) __z88dk_fastcall {
    unsigned char letter[2];
    char *chr;
    uint8_t col = button->col + 1;
    bool marked = false;

    letter[1] = 0;
    tm_blank(button->col, button->row, strlen(button->label) + 2, ATTR_BAR);
    for(chr = button->label; *chr; chr++, col++) {
        letter[0] = *chr;
        if(!marked && tolower(*chr) == button->shortcut) {
            marked = true;
            tm_text(col, button->row, letter, ATTR_BAR_KEY);
        } else {
            tm_text(col, button->row, letter, ATTR_BAR);
        }
    }
}
