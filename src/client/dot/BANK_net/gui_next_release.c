#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char *gui_next_release(void) {
    while(reply_field()) {
        if(replyTag != TAG_RELEASE) continue;
        reply_release();
        return version;
    }
    return NULL;
}
