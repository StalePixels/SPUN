#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "run.h"

bool categoriesShown;
unsigned char categoryName[33];
static uint16_t listPage;
static uint8_t listRow;

// The categories take the list's place, page and counts; only paging, picking, Back, Edit and BREAK act on them.
// in_inkey gives BREAK (CAPS SHIFT + SPACE) as a space, so CAPS SHIFT tells them apart
uint8_t category_key(unsigned char key, uint8_t action) {
    if(!categoriesShown) {
        listPage = page;
        listRow = listSel;
        categoriesShown = true;
        page = 1;
        listSel = 0;
    } else if(action == ACTION_BACK || key == KEY_EDIT || (key == ' ' && in_key_pressed(IN_KEY_SCANCODE_CAPS))) {
        categoriesShown = false;
        page = listPage;
        listSel = listRow;
    } else if(action == ACTION_OPEN) {
        *categorySlug = 0;
        if(listSel) {
            _farWithPointer(BANK_NET, (far_ptr_fn_t)gui_category_at, (void *)(uint16_t)(listSel - 1));
            strcpy(categorySlug, entrySlug);
            strcpy(categoryName, entryName);
        }
        categoriesShown = false;
        page = 1;
        listSel = 0;
    } else {
        return action > ACTION_NEXT ? ACTION_NONE : action;
    }
    page_show();
    return ACTION_NONE;
}
