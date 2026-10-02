#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_packages/install.h"
#include "run.h"

static const struct gui_button updateButtons[] = {
    { MODAL_COL + 2, MODAL_BUTTON_ROW, 'u', "Update" },
    { MODAL_COL + 12, MODAL_BUTTON_ROW, 'i', "Ignore" },
};

void updates_offer(void) {
    unsigned char text[48];
    unsigned char *lines[2];
    unsigned char *error;

    if(updateCount == 1) strcpy(text, "1 installed app has an update.");
    else sprintf(text, "%u installed apps have updates.", updateCount);
    lines[0] = (unsigned char *)"Updates";
    lines[1] = text;

    tm_blank(0, BUTTON_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(modal_ask(lines, 2, updateButtons, 2) == 0) {
        error = os_call(BANK_PACKAGES, (void *(*)(void *))spun_update, NULL);
        if(error) updateError = error;
    }
    gui_draw();
}
