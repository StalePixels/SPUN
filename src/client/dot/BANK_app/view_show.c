#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

// The NXI goes straight into Layer 2 while it shows, so the user watches it arrive. The default
// palette is set again after it for the thumbnails
unsigned char *view_show(uint8_t slot) __z88dk_fastcall {
    struct l2_target file;
    unsigned char *error;

    file.slot = slot;
    file.width = 0;

    _far(BANK_SCREEN, (void *(*)(void))tilemap_off);
    _far(BANK_SCREEN, (void *(*)(void))layer2_clear);
    _farWithPointer(BANK_SCREEN, (void *(*)(void *))layer2_on, (void *)(shotWidth[slot - 1] == 320 ? LAYER2_320 : LAYER2_256));

    intrinsic_di();
    pointer_hide();
    error = _farWithPointer(BANK_NET, (void *(*)(void *))gui_get, &file);
    intrinsic_ei();

    if(!error) {
        do intrinsic_halt();
        while(!input_poll());
    }

    _far(BANK_SCREEN, (void *(*)(void))layer2_off);
    _far(BANK_SCREEN, (void *(*)(void))palette_default);
    _far(BANK_SCREEN, (void *(*)(void))tilemap_on);
    return error;
}
