#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_packages/install.h"
#include "run.h"

static const struct modal_button updateButtons[] = { { 'u', "Update", INK_GREEN }, { 'i', "Ignore", INK_RED } };

void updates_offer(void) {
    unsigned char text[48];
    unsigned char *line = text;
    unsigned char *error;

    if(updateCount == 1) strcpy(text, "1 installed app has an update.");
    else sprintf(text, "%u installed apps have updates.", updateCount);

    tm_blank(0, BUTTON_ROW, GUI_COLUMNS, ATTR_TEXT);
    if(modal_ask((unsigned char *)"Updates", &line, 1, updateButtons, 2) == 0) {
        error = os_call(BANK_PACKAGES, (void *(*)(void *))spun_update, NULL);
        if(error) updateError = error;
    }
    gui_draw();
}
