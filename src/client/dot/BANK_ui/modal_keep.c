#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

static uint8_t kept[BOX_ROWS_MAX * BOX_COLUMNS * 2];

void modal_keep(uint8_t top, uint8_t rows, bool restore) {
    uint8_t *cell = (uint8_t *)0x6C00 + ((ULA_TILE_ROW + top) * GUI_COLUMNS + BOX_COL) * 2;
    uint8_t *at = kept;

    for(; rows; rows--) {
        if(restore) memcpy(cell, at, BOX_COLUMNS * 2);
        else memcpy(at, cell, BOX_COLUMNS * 2);
        cell += GUI_COLUMNS * 2;
        at += BOX_COLUMNS * 2;
    }
}
