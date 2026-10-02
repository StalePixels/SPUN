#include "../common/spun.h"
#include "reply.h"

uint16_t reply_enter(void) {
    uint16_t end = replyEnd;

    replyEnd = replyNext;
    replyNext = replyValue;
    return end;
}
