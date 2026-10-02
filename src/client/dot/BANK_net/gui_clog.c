#include "../common/spun.h"
#include "../gui/gui.h"
#include "net.h"
#include "../BANK_app/app.h"
#include "reply.h"

// SPCLOG of appid and serial. The reply takes the block, so the SPINFO reply is gone after it
unsigned char *gui_clog(void) {
    unsigned char *error;

    sprintf(nbnBuff, "SPCLOG %s %u\x0A", appid, serial);
    if((error = reply_request())) return error;

    *changelog = 0;
    while(reply_field()) {
        if(replyTag == TAG_VERSION) reply_text(version, sizeof(version));
        else if(replyTag == TAG_DATE) reply_text(date, sizeof(date));
        else if(replyTag == TAG_CHANGELOG) reply_text(changelog, sizeof(changelog));
    }
    return NULL;
}
