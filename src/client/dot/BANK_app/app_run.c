#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

uint8_t relSel;
uint8_t relTop;

// Not NULL to quit the GUI, as _far gives back only a pointer
unsigned char *app_run(void) {
    unsigned char *quit = NULL;
    unsigned char *error;
    unsigned char event;
    uint8_t action;
    uint8_t slot;
    uint8_t row;

    relSel = 0;
    relTop = 0;
    app_show(true);

    while(1) {
        intrinsic_halt();
        event = input_poll();
        if(!event) continue;

        action = ACTION_NONE;
        slot = 0;
        if(event == INPUT_CLICK) {
            action = button_at(appButtons, appButtonCount);
            row = clickY >> 3;
            if(action == ACTION_NONE) slot = thumb_at();
            if(action == ACTION_NONE && clickX >= REL_BAR_COL * 4 && row >= REL_ROW && row < REL_ROW + REL_ROWS && relTop + row - REL_ROW < releaseRows) {
                release_select(relTop + row - REL_ROW);
                action = APP_CHANGELOG;
            }
        } else if(event == KEY_UP) {
            if(relSel) release_select(relSel - 1);
        } else if(event == KEY_DOWN) {
            if(relSel + 1 < releaseRows) release_select(relSel + 1);
        } else if(event == KEY_ENTER) {
            action = APP_CHANGELOG;
        } else if(event == KEY_EDIT) {
            action = APP_BACK;
        } else if(event >= '1' && event < '1' + SLOTS) {
            slot = event - '0';
        } else {
            action = button_key(appButtons, appButtonCount, event);
        }

        if(action == APP_BACK) break;
        if(action == APP_QUIT) {
            quit = appid;
            break;
        }
        if(action == APP_INSTALL) app_install();
        if(action == APP_CHANGELOG && releaseRows) {
            clog_show();
            app_show(false);
        }
        if(slot && shotWidth[slot - 1]) {
            error = view_show(slot);
            app_show(true);
            if(error) message_show(error);
        }
    }

    _far(BANK_SCREEN, (void *(*)(void))layer2_off);
    return quit;
}
