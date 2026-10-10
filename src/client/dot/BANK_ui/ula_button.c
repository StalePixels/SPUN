#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

void ula_button(uint8_t x, uint8_t y, unsigned char *label, unsigned char shortcut, uint8_t ink) {
    uint8_t *attr = zx_cxy2aaddr(x, y);
    uint8_t length = strlen((char *)label);
    uint8_t at;

    memset(attr, ULA_BAR, length + 2);
    ula_text(x + 1, y, label);
    for(at = 0; at != length; at++) {
        if(tolower(label[at]) == shortcut) {
            attr[at + 1] = ULA_BRIGHT | ink;
            return;
        }
    }
}
