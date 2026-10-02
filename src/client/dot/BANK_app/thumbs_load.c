#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// The cells behind each picture are black, as is Layer 2's transparent colour; they are drawn
// also when the pictures are already in Layer 2
unsigned char *thumbs_load(bool load) __z88dk_fastcall {
    struct l2_target rect;
    unsigned char *failed = NULL;
    unsigned char *error;
    uint8_t missing = 0;
    uint8_t slot;
    uint8_t row;

    for(slot = 1; slot <= SLOTS; slot++) {
        thumb_rect(slot, &rect);
        for(row = 0; row != rect.height / 8; row++) tm_blank(rect.x / 4, rect.y / 8 + row, rect.width / 4, ATTR_BLACK);
        if(!shotWidth[slot - 1]) missing |= 1 << slot;
    }
    if(!load) return NULL;

    intrinsic_di();
    pointer_hide();
    for(slot = 1; slot <= SLOTS; slot++) {
        if(missing & (1 << slot)) continue;
        thumb_rect(slot, &rect);
        error = _farWithPointer(BANK_NET, (void *(*)(void *))gui_get, &rect);
        if(!error) continue;
        failed = error;
        missing |= 1 << slot;
    }
    intrinsic_ei();

    for(slot = 1; slot <= SLOTS; slot++) {
        if(!(missing & (1 << slot))) continue;
        thumb_rect(slot, &rect);
        _farWithPointer(BANK_SCREEN, (void *(*)(void *))placeholder_draw, &rect);
    }
    return failed;
}
