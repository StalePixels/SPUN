#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// SPINFO lists the releases newest first, so the first is the latest
unsigned char *latest(char *id) {
    unsigned char *error;

    if((error = send_info(id))) return error;

    while(reply_field()) {
        if(replyTag != TAG_RELEASE) continue;
        reply_release();
        return NULL;
    }
    return err_no_release;
}
