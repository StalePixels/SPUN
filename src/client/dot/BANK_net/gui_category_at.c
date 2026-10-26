#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// The entry at index of the SPCATS reply that is still in the block
unsigned char *gui_category_at(uint16_t index) {
    reply_rewind();
    while(gui_next_category()) {
        if(!index--) return entryName;
    }
    return NULL;
}
