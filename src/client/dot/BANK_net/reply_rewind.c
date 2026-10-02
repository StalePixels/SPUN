#include "../common/spun.h"
#include "reply.h"

void reply_rewind(void) {
    replyNext = 0;
    replyEnd = replySize;
}
