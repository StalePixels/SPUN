#include "../common/spun.h"
#include "reply.h"

void reply_app(void) {
    uint16_t end = reply_enter();

    *appid = *username = *title = *version = 0;
    serial = 0;
    downloads = 0;

    while(reply_field()) {
        if(replyTag == TAG_APP_ID) reply_text(appid, sizeof(appid));
        else if(replyTag == TAG_USERNAME) reply_text(username, sizeof(username));
        else if(replyTag == TAG_TITLE) reply_text(title, sizeof(title));
        else if(replyTag == TAG_SERIAL) serial = reply_number();
        else if(replyTag == TAG_VERSION) reply_text(version, sizeof(version));
        else if(replyTag == TAG_DOWNLOADS) downloads = reply_number();
    }
    reply_leave(end);
}
