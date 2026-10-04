#include "../common/spun.h"
#include "gui.h"

// The cells under the box are kept in tilemapBackup's page, after the tile area that tiles_give keeps there
static void modal_keep(bool restore) __z88dk_fastcall {
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t top = ZXN_READ_REG(REG_MMU0 + 7);
    uint8_t *cell = (uint8_t *)0x6C00 + (MODAL_ROW * GUI_COLUMNS + MODAL_COL) * 2;
    uint8_t *kept = (uint8_t *)0xE000 + 224 * 8 + GUI_COLUMNS * GUI_ROWS * 2;
    uint8_t row;

    ZXN_WRITE_MMU3(11);
    ZXN_WRITE_MMU7(tilemapBackup);
    for(row = MODAL_ROW; row != MODAL_BUTTON_ROW + 2; row++) {
        if(restore) memcpy(cell, kept, MODAL_WIDTH * 2);
        else memcpy(kept, cell, MODAL_WIDTH * 2);
        cell += GUI_COLUMNS * 2;
        kept += MODAL_WIDTH * 2;
    }
    ZXN_WRITE_MMU7(top);
    ZXN_WRITE_MMU3(mmu3);
}

uint8_t modal_ask(unsigned char **lines, uint8_t lineCount, const struct gui_button *buttons, uint8_t count) {
    unsigned char edge[MODAL_WIDTH + 1];
    unsigned char event;
    uint8_t choice = ACTION_NONE;
    uint8_t row;

    modal_keep(false);
    memset(edge + 1, 0xCD, MODAL_WIDTH - 2);
    edge[MODAL_WIDTH] = 0;
    edge[0] = 0xC9;
    edge[MODAL_WIDTH - 1] = 0xBB;
    tm_text(MODAL_COL, MODAL_ROW, edge, ATTR_TEXT);
    edge[0] = 0xC8;
    edge[MODAL_WIDTH - 1] = 0xBC;
    tm_text(MODAL_COL, MODAL_BUTTON_ROW + 1, edge, ATTR_TEXT);

    for(row = MODAL_ROW + 1; row != MODAL_BUTTON_ROW + 1; row++) {
        tm_blank(MODAL_COL, row, MODAL_WIDTH, ATTR_TEXT);
        tm_text(MODAL_COL, row, (unsigned char *)"\xBA", ATTR_TEXT);
        tm_text(MODAL_COL + MODAL_WIDTH - 1, row, (unsigned char *)"\xBA", ATTR_TEXT);
    }
    for(row = 0; row != lineCount && row != MODAL_LINES; row++) {
        tm_cut(MODAL_COL + 2, MODAL_ROW + 1 + row, lines[row], MODAL_WIDTH - 4, row ? ATTR_TEXT : ATTR_KEY);
    }
    for(row = 0; row != count; row++) button_draw(&buttons[row]);

    while(choice == ACTION_NONE) {
        intrinsic_halt();
        event = input_poll();
        if(event == INPUT_CLICK) choice = button_at(buttons, count);
        else if(event) choice = button_key(buttons, count, event);
    }
    modal_keep(true);
    return choice;
}
