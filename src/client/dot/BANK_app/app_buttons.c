#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// The changelog page shows only the first
const struct gui_button appButtons[] = {
    { APP_BACK, 1, BUTTON_ROW, 'b', "Back" },
    { APP_CHANGELOG, 8, BUTTON_ROW, 'c', "Changelog" },
    { APP_QUIT, 31, BUTTON_ROW, 'q', "Quit" },
    { APP_INSTALL, 20, BUTTON_ROW, 'i', "Install" },
    { APP_ADVANCED, 38, BUTTON_ROW, 'a', "Advanced" },
};
const uint8_t appButtonCount = sizeof(appButtons) / sizeof(appButtons[0]);
