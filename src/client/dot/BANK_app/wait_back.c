#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

void wait_back(void) {
    unsigned char event;

    while(1) {
        intrinsic_halt();
        event = input_poll();
        if(event == INPUT_CLICK) {
            if(button_at(appButtons, 1) == APP_BACK) return;
        } else if(event == KEY_EDIT || event == KEY_ENTER || tolower(event) == 'b') {
            return;
        }
    }
}
