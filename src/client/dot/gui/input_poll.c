#include "../common/spun.h"
#include "gui.h"

uint16_t clickX;
uint16_t clickY;

static unsigned char lastKey;
static uint8_t lastButton = MOUSE_LEFT;

// A key acts when it goes down and a click when the left button goes down; holding either does
// nothing more. The state is shared by every page, so a click that opens a page does not act on it
unsigned char input_poll(void) {
    unsigned char key = in_inkey();
    uint8_t button = mouse_btn & MOUSE_LEFT;
    unsigned char event = 0;

    if(key && key != lastKey) event = key;
    lastKey = key;

    if(!button && lastButton) {
        intrinsic_di();
        clickX = ptr_x;
        clickY = ptr_y;
        intrinsic_ei();
        event = INPUT_CLICK;
    }
    lastButton = button;
    return event;
}
