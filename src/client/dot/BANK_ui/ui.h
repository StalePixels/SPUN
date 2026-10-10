#ifndef SPUN_UI_H
#define SPUN_UI_H

#include <stdint.h>
#include <stdbool.h>

struct modal;

// ULA character cells of the box; the ULA's cell x is tilemap columns 8 + 2x and 9 + 2x, its row y tilemap row 4 + y
#define BOX_LEFT        1
#define BOX_RIGHT       30
#define BOX_WIDTH       (BOX_RIGHT - BOX_LEFT + 1)
#define BOX_COL         (8 + 2 * BOX_LEFT)
#define BOX_COLUMNS     (2 * BOX_WIDTH)
#define BOX_TEXT_COL    (BOX_COL + 2)
#define BOX_ROWS_MAX    (MODAL_LINES + 5)
#define ULA_ROWS        24
#define ULA_TILE_ROW    4

// ULA attributes: BRIGHT, then paper and ink in Spectrum colours
#define ULA_BAR         0x47
#define ULA_BRIGHT      0x40
#define ULA_FRAME       0x78

uint8_t modal_run(struct modal *modal);
void modal_keep(uint8_t top, uint8_t rows, bool restore);
void box_draw(unsigned char *title, uint8_t top, uint8_t rows);
void box_erase(uint8_t top, uint8_t rows);
void ula_text(uint8_t x, uint8_t y, unsigned char *text);
void ula_button(uint8_t x, uint8_t y, unsigned char *label, unsigned char shortcut, uint8_t ink);
uint8_t ula_button_at(struct modal *modal, uint8_t *left, uint8_t row);

#endif
