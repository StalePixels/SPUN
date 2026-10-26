#include "../common/spun.h"
#include "gui.h"

uint8_t button_at(const struct gui_button *table, uint8_t count) {
    uint8_t col = clickX >> 2;
    uint8_t row = clickY >> 3;
    uint8_t index;

    for(index = 0; index != count; index++) {
        if(row != table[index].row) continue;
        if(col < table[index].col) continue;
        if(col >= table[index].col + strlen(table[index].label) + 2) continue;
        return table[index].action;
    }
    return ACTION_NONE;
}
