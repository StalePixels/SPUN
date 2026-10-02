#include "../common/spun.h"
#include "../gui/gui.h"
#include "net.h"
#include "../BANK_app/app.h"
#include "reply.h"

// SPINFO page 1 of appid. page is the list's page, so it is kept; SPINFO's counts are the releases
unsigned char *gui_info(void) {
    unsigned char name[33];
    unsigned char *error;
    uint16_t listPage = page;
    uint16_t end;
    uint16_t width;
    uint8_t slot;

    page = 1;
    error = send_info(appid);
    page = listPage;
    if(error) return error;

    releaseCount = totalItems;
    releaseRows = 0;

    while(reply_field()) {
        if(replyTag == TAG_RELEASE) {
            releaseRows++;
        } else if(replyTag == TAG_CATEGORY) {
            reply_text(name, sizeof(name));
            if(strlen(categoryText) + strlen(name) + 3 > sizeof(categoryText)) continue;
            if(*categoryText) strcat(categoryText, ", ");
            strcat(categoryText, name);
        } else if(replyTag == TAG_SCREENSHOT) {
            end = reply_enter();
            slot = 0;
            width = 0;
            while(reply_field()) {
                if(replyTag == TAG_SLOT) slot = reply_number();
                else if(replyTag == TAG_WIDTH) width = reply_number();
            }
            reply_leave(end);
            if(slot >= 1 && slot <= SLOTS) shotWidth[slot - 1] = width;
        }
    }
    reply_rewind();
    return NULL;
}
