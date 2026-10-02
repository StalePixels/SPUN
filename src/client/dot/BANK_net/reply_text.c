#include "../common/spun.h"
#include "reply.h"

void reply_text(unsigned char *dest, uint16_t size) {
    uint16_t at = 0;

    while(replyValue < replyNext) {
        unsigned char chr = reply_byte();

        if(at + 1 < size) dest[at++] = chr;
    }
    dest[at] = 0;
}
