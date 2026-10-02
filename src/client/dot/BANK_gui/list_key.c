#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

uint8_t list_key(unsigned char key) __z88dk_fastcall {
    if(key == KEY_UP) {
        if(listSel) list_select(listSel - 1);
        return ACTION_NONE;
    }
    if(key == KEY_DOWN) {
        if(listSel + 1 < listCount) list_select(listSel + 1);
        return ACTION_NONE;
    }
    if(key == KEY_ENTER) return listCount ? ACTION_OPEN : ACTION_NONE;
    return button_key(buttons, buttonCount, key);
}
