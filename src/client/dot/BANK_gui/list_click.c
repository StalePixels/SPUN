#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

uint8_t list_click(void) {
    uint8_t row = clickY >> 3;
    uint8_t action = button_at(buttons, buttonCount);

    if(action != ACTION_NONE) return action;
    if(row < LIST_ROW || row >= LIST_ROW + listCount) return ACTION_NONE;
    list_select(row - LIST_ROW);
    return ACTION_OPEN;
}
