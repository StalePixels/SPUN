#include "../common/spun.h"
#include "reply.h"

// The block is paged over the screen at 0x4000, so page it out again before anything prints
unsigned char reply_byte(void) {
    unsigned char value;

    if(replyValue >= replyEnd) NBN_Fail(err_nbn_protocol);

    NBN_PageIn();
    value = nbnBlock[replyValue++];
    NBN_PageOut();

    return value;
}
