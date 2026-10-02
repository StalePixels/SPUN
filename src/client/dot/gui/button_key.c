#include "../common/spun.h"
#include "gui.h"

uint8_t button_key(const struct gui_button *table, uint8_t count, unsigned char key) {
    uint8_t index;

    key = tolower(key);
    for(index = 0; index != count; index++) {
        if(key == table[index].shortcut) return index;
    }
    return ACTION_NONE;
}
