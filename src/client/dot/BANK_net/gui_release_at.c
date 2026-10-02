#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// The release at index of the SPINFO reply that is still in the block
unsigned char *gui_release_at(uint16_t index) {
    reply_rewind();
    while(gui_next_release()) {
        if(!index--) return version;
    }
    return NULL;
}
