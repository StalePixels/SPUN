#include "../common/spun.h"
#include "../gui/gui.h"
#include "run.h"

static const struct gui_button *pageButtons;
static uint8_t pageButtonCount;
static uint8_t buttonsLive;

// The current screen's table is the only one that draws, takes keys and takes clicks.
// One bit for each ACTION_ that is live; a button that would do nothing is dim
void buttons_show(void) {
    uint8_t index;

    pageButtons = categoriesShown ? pickButtons : listButtons;
    pageButtonCount = categoriesShown ? pickButtonCount : listButtonCount;
    buttonsLive = 0;
    if(!helpShown && page > 1) buttonsLive |= 1 << ACTION_PREV;
    if(!helpShown && page < totalPages) buttonsLive |= 1 << ACTION_NEXT;
    if(categoriesShown) buttonsLive |= 1 << ACTION_BACK;
    else buttonsLive |= (1 << ACTION_SEARCH) | (1 << ACTION_CATEGORY) | (1 << ACTION_HELP) | (1 << ACTION_QUIT);
    tm_blank(0, BUTTON_ROW, GUI_COLUMNS, ATTR_TEXT);
    for(index = 0; index != pageButtonCount; index++) {
        button_draw(&pageButtons[index]);
        if(!(buttonsLive & (1 << pageButtons[index].action))) {
            tm_attr(pageButtons[index].col, BUTTON_ROW, strlen(pageButtons[index].label) + 2, ATTR_BAR_DIM);
        }
    }
}

uint8_t buttons_key(unsigned char key) __z88dk_fastcall {
    uint8_t action = button_key(pageButtons, pageButtonCount, key);

    return action != ACTION_NONE && (buttonsLive & (1 << action)) ? action : ACTION_NONE;
}

uint8_t buttons_click(void) {
    uint8_t action = button_at(pageButtons, pageButtonCount);

    return action != ACTION_NONE && (buttonsLive & (1 << action)) ? action : ACTION_NONE;
}
