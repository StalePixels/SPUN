#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

void buttons_draw(uint8_t count) __z88dk_fastcall {
    uint8_t index;

    tm_blank(0, BUTTON_ROW, GUI_COLUMNS, ATTR_TEXT);
    for(index = 0; index != count; index++) button_draw(&appButtons[index]);
}
