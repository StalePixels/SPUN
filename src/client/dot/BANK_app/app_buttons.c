#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// In APP_ order; the changelog page shows only the first
const struct gui_button appButtons[] = {
    { 1, BUTTON_ROW, 'b', "Back" },
    { 8, BUTTON_ROW, 'c', "Changelog" },
    { 31, BUTTON_ROW, 'q', "Quit" },
    { 20, BUTTON_ROW, 'i', "Install" },
};
const uint8_t appButtonCount = sizeof(appButtons) / sizeof(appButtons[0]);
