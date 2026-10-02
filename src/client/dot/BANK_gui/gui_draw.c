#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

void gui_draw(void) {
    uint8_t index;

    title_draw();
    tm_blank(0, BUTTON_ROW, GUI_COLUMNS, ATTR_TEXT);
    for(index = 0; index != buttonCount; index++) button_draw(&buttons[index]);
}
