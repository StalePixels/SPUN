#include "../common/spun.h"
#include "reply.h"

bool reply_field(void) {
    if(replyNext >= replyEnd) return false;

    replyValue = replyNext;
    replyTag = reply_byte();
    replyLength = reply_byte();
    if(replyTag >= REPLY_LONG_TAG) replyLength |= reply_byte() << 8;

    if(replyLength > replyEnd - replyValue) NBN_Fail(err_nbn_protocol);
    replyNext = replyValue + replyLength;
    return true;
}
