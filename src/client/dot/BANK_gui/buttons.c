#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

const struct gui_button listButtons[] = {
    { ACTION_PREV, 1, BUTTON_ROW, 'p', "Prev" },
    { ACTION_NEXT, 8, BUTTON_ROW, 'n', "Next" },
    { ACTION_SEARCH, 15, BUTTON_ROW, 's', "Search" },
    { ACTION_CATEGORY, 24, BUTTON_ROW, 'c', "Category" },
    { ACTION_HELP, 35, BUTTON_ROW, 'h', "Help" },
    { ACTION_QUIT, 42, BUTTON_ROW, 'q', "Quit" },
};
const uint8_t listButtonCount = sizeof(listButtons) / sizeof(listButtons[0]);

// Back takes Category's place; Search, Help and Quit stay, dim, so the row keeps the list's layout
const struct gui_button pickButtons[] = {
    { ACTION_PREV, 1, BUTTON_ROW, 'p', "Prev" },
    { ACTION_NEXT, 8, BUTTON_ROW, 'n', "Next" },
    { ACTION_SEARCH, 15, BUTTON_ROW, 's', "Search" },
    { ACTION_BACK, 24, BUTTON_ROW, 'b', "Back" },
    { ACTION_HELP, 35, BUTTON_ROW, 'h', "Help" },
    { ACTION_QUIT, 42, BUTTON_ROW, 'q', "Quit" },
};
const uint8_t pickButtonCount = sizeof(pickButtons) / sizeof(pickButtons[0]);
