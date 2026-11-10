#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// id is in main memory, where the bank that asks can read it. A pointer, not a bool: a far call
// returns all of HL
unsigned char *deps_next(unsigned char *id) {
    while(reply_field()) {
        if(replyTag != TAG_APP_ID) continue;
        reply_text(id, sizeof(appid));
        return id;
    }
    return NULL;
}
