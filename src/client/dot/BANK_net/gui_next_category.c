#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char entrySlug[17];
unsigned char entryName[33];

// Returns a pointer, not a bool, because the caller in another bank gets it through _far
unsigned char *gui_next_category(void) {
    uint16_t end;

    while(reply_field()) {
        if(replyTag != TAG_CATEGORY_ENTRY) continue;
        end = reply_enter();
        *entrySlug = *entryName = 0;
        while(reply_field()) {
            if(replyTag == TAG_SLUG) reply_text(entrySlug, sizeof(entrySlug));
            else if(replyTag == TAG_CATEGORY) reply_text(entryName, sizeof(entryName));
        }
        reply_leave(end);
        return entryName;
    }
    return NULL;
}
