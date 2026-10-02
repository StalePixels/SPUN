#include "../common/spun.h"
#include "reply.h"

// Little-endian, of any length, so a server can send a wider field; bytes past four are skipped
uint32_t reply_number(void) {
    uint32_t value = 0;
    uint8_t shift = 0;

    while(replyValue < replyNext) {
        unsigned char byte = reply_byte();

        if(shift < 32) value |= (uint32_t)byte << shift;
        shift += 8;
    }
    return value;
}
