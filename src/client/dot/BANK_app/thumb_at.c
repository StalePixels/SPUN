#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

uint8_t thumb_at(void) {
    struct l2_target rect;
    uint8_t slot;

    for(slot = 1; slot <= SLOTS; slot++) {
        thumb_rect(slot, &rect);
        if(clickX < rect.x || clickX >= rect.x + rect.width) continue;
        if(clickY < rect.y || clickY >= rect.y + rect.height) continue;
        return slot;
    }
    return 0;
}
