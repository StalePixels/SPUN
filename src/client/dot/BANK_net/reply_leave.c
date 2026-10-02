#include "../common/spun.h"
#include "reply.h"

void reply_leave(uint16_t end) __z88dk_fastcall {
    replyNext = replyEnd;
    replyEnd = end;
}
