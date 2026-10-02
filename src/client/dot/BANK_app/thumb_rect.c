#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

void thumb_rect(uint8_t slot, struct l2_target *rect) {
    uint8_t small = slot - 2;

    rect->slot = slot;
    if(slot == 1) {
        rect->x = THUMB_X;
        rect->y = THUMB_Y;
        rect->width = THUMB_BIG_W;
        rect->height = THUMB_BIG_H;
        return;
    }
    rect->x = THUMB_X + THUMB_BIG_W + THUMB_GAP + (small / THUMB_PER_COLUMN) * (THUMB_SMALL_W + THUMB_GAP);
    rect->y = THUMB_Y + (small % THUMB_PER_COLUMN) * THUMB_SMALL_H;
    rect->width = THUMB_SMALL_W;
    rect->height = THUMB_SMALL_H;
}
