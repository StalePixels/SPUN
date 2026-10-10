#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

// The ULA screen starts 32 pixels into the 320x256 area in both directions
uint8_t ula_button_at(struct modal *modal, uint8_t *left, uint8_t row) {
    uint8_t index;
    uint8_t x;

    if(clickX < 32 || clickX >= 288 || clickY >> 3 != ULA_TILE_ROW + row) return ACTION_NONE;
    x = (clickX - 32) >> 3;
    for(index = 0; index != modal->count; index++) {
        if(x >= left[index] && x < left[index] + strlen(modal->labels[index]) + 2) return index;
    }
    return ACTION_NONE;
}
