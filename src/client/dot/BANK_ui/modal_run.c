#include "../common/spun.h"
#include "../gui/gui.h"
#include "ui.h"

// The ULA draws the frame, the title bar and the buttons over cells with ATTR_ULA_OVER; the tilemap draws
// the text. Pages 10 and 11 are mapped at $4000 for both, as a block read may have left its buffer there
uint8_t modal_run(struct modal *modal) {
    uint8_t mmu2 = ZXN_READ_REG(REG_MMU0 + 2);
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint8_t rows = modal->lineCount + 5;
    uint8_t top = (ULA_ROWS - rows) / 2;
    uint8_t buttonRow = top + rows - 2;
    uint8_t left[MODAL_BUTTONS];
    uint8_t choice = ACTION_NONE;
    uint8_t x = BOX_LEFT + 1;
    uint8_t index;
    unsigned char event;

    ZXN_WRITE_MMU2(10);
    ZXN_WRITE_MMU3(11);
    modal_keep(top, rows, false);
    for(index = 0; index != rows; index++) {
        tm_blank(BOX_COL, ULA_TILE_ROW + top + index, BOX_COLUMNS, ATTR_MODAL | ATTR_ULA_OVER);
    }
    for(index = 0; index != modal->lineCount; index++) {
        tm_text(BOX_TEXT_COL, ULA_TILE_ROW + top + 2 + index, modal->lines[index], ATTR_MODAL | ATTR_ULA_OVER);
    }
    box_draw(modal->title, top, rows);
    for(index = 0; index != modal->count; index++) {
        left[index] = x;
        ula_button(x, buttonRow, modal->labels[index], modal->shortcuts[index], modal->inks[index]);
        x += strlen(modal->labels[index]) + 3;
    }

    while(choice == ACTION_NONE) {
        intrinsic_halt();
        event = input_poll();
        if(event == INPUT_CLICK) {
            choice = ula_button_at(modal, left, buttonRow);
        } else if(event) {
            for(index = 0; index != modal->count; index++) {
                if(tolower(event) == modal->shortcuts[index]) choice = index;
            }
        }
    }
    box_erase(top, rows);
    modal_keep(top, rows, true);
    ZXN_WRITE_MMU3(mmu3);
    ZXN_WRITE_MMU2(mmu2);
    return choice;
}
