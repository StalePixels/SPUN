#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// Returns a pointer, not a bool, because the caller in another bank gets it through _far
unsigned char *reply_next_app(void) {
    while(reply_field()) {
        if(replyTag != TAG_APP) continue;
        reply_app();
        return appid;
    }
    return NULL;
}
