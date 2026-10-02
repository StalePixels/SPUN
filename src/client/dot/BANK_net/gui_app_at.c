#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// The entry at index of the SPLIST or SPFIND reply that is still in the block
unsigned char *gui_app_at(uint16_t index) {
    reply_rewind();
    while(reply_next_app()) {
        if(!index--) return appid;
    }
    return NULL;
}
