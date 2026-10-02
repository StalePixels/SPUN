#include "../common/spun.h"
#include "reply.h"

void reply_release(void) {
    uint16_t end = reply_enter();

    *version = *date = 0;
    serial = 0;

    while(reply_field()) {
        if(replyTag == TAG_SERIAL) serial = reply_number();
        else if(replyTag == TAG_VERSION) reply_text(version, sizeof(version));
        else if(replyTag == TAG_DATE) reply_text(date, sizeof(date));
    }
    reply_leave(end);
}
