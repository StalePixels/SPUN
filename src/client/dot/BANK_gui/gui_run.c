#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_screen/screen.h"
#include "run.h"

// The quit key is let go before NextZXOS gets the keyboard back, so that it does not see it
void gui_run(void) {
    unsigned char event;
    uint8_t action = ACTION_NONE;

    _far(BANK_SCREEN, (void *(*)(void))splash);
    gui_draw();
    *searchText = 0;
    page = 1;
    listSel = 0;
    if(updateCount) updates_offer();
    page_show();
    if(updateError) message_show(updateError);

    while(action != ACTION_QUIT) {
        intrinsic_halt();
        event = input_poll();
        if(event == INPUT_CLICK) action = list_click();
        else if(event) action = list_key(event);
        else action = ACTION_NONE;

        switch(action) {
            case ACTION_PREV:
                if(page > 1) {
                    page--;
                    listSel = 0;
                    page_show();
                }
                break;
            case ACTION_NEXT:
                if(page < totalPages) {
                    page++;
                    listSel = 0;
                    page_show();
                }
                break;
            case ACTION_SEARCH:
                search_run();
                break;
            case ACTION_HELP:
                help_toggle();
                break;
            case ACTION_OPEN:
                if(app_open()) action = ACTION_QUIT;
                break;
        }
    }

    while(in_test_key()) intrinsic_halt();
}
