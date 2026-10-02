#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

// In ACTION_ order
const struct gui_button buttons[] = {
    { 1, BUTTON_ROW, 'p', "Prev" },
    { 8, BUTTON_ROW, 'n', "Next" },
    { 15, BUTTON_ROW, 's', "Search" },
    { 24, BUTTON_ROW, 'h', "Help" },
    { 31, BUTTON_ROW, 'q', "Quit" },
};
const uint8_t buttonCount = sizeof(buttons) / sizeof(buttons[0]);
