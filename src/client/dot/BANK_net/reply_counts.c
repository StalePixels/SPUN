#include "../common/spun.h"
#include "reply.h"

void reply_counts(void) {
    totalItems = 0;
    totalPages = 0;

    reply_rewind();
    while(reply_field()) {
        if(replyTag == TAG_TOTAL) totalItems = reply_number();
        else if(replyTag == TAG_PAGE) page = reply_number();
        else if(replyTag == TAG_PAGES) totalPages = reply_number();
    }
    reply_rewind();
}
