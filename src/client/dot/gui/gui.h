#ifndef SPUN_GUI_H
#define SPUN_GUI_H

#include <stdint.h>
#include <stdbool.h>

#define GUI_COLUMNS     80
#define GUI_ROWS        32

// Rows 0 and 31 are outside the picture on a 60 Hz display, so the GUI draws only in rows 1-30
#define TITLE_ROW       1
#define STATUS_ROW      25
#define BUTTON_ROW      30

// Tilemap attributes: palette offsets of the 1-bit tilemap (BANK_screen/screen_on.c).
// ATTR_BLACK is the cells behind a picture in Layer 2, whose transparent colour is black
#define ATTR_TEXT       0x00
#define ATTR_KEY        0x02
#define ATTR_BAR        0x04
#define ATTR_BAR_KEY    0x06
#define ATTR_BLACK      0x08

#define MOUSE_LEFT      0x02

#define KEY_EDIT        7
#define KEY_DOWN        10
#define KEY_UP          11
#define KEY_DELETE      12
#define KEY_ENTER       13

// input_poll's event for a click; in_inkey never gives this code
#define INPUT_CLICK     0xFF
#define ACTION_NONE     0xFF

// The longest search text the GUI sends; as long as a title
#define SEARCH_LENGTH   32

// 320x256 Layer 2, 80K; 256x192 uses the first 48K of it
#define LAYER2_PAGES    10

#define MODAL_COL       10
#define MODAL_WIDTH     60
#define MODAL_ROW       11
#define MODAL_LINES     4
#define MODAL_BUTTON_ROW (MODAL_ROW + MODAL_LINES + 2)

#define ULA_AREAS       5
#define TILE_AREAS      2
#define BANK5_SAVE      0
#define BANK5_LOAD      1
#define BANK5_SWAP      2

#define INSTALL_NEW     0
#define INSTALL_AGAIN   1
#define INSTALL_UPDATE  2

struct bank5_area {
    uint16_t at;
    uint16_t size;
};

struct gui_button {
    uint8_t col;
    uint8_t row;
    unsigned char shortcut;
    char *label;
};

extern volatile uint16_t ptr_x;
extern volatile uint16_t ptr_y;
extern volatile uint8_t mouse_btn;

extern bool guiOpen;
extern bool tilemapIn;
extern uint8_t tilemapBackup;
extern uint8_t ulaBackup;
extern const struct bank5_area ulaAreas[ULA_AREAS];
extern uint8_t layer2Page;
extern unsigned char searchText[SEARCH_LENGTH + 1];
extern uint16_t clickX;
extern uint16_t clickY;
extern uint16_t updateCount;
extern uint8_t installCase;

void im2_save(void);
void im2_on(void);
void im2_off(void);
void im2_quiet(void);

bool layer2_reserve(void);
void gui_alloc(void);
void gui_free(void);
void bank5_move(const struct bank5_area *area, uint8_t count, uint8_t page, uint8_t how);
bool tiles_give(void);
void tiles_take(void);
unsigned int dos_mapping(unsigned char drive) __z88dk_fastcall;
unsigned int os_mapping(unsigned char drive) __z88dk_fastcall;
void sprites_load(void);
void pointer_hide(void);
void tm_blank(uint8_t col, uint8_t row, uint16_t count, uint8_t attr);
unsigned char *tm_text(uint8_t col, uint8_t row, unsigned char *text, uint8_t attr);
void tm_attr(uint8_t col, uint8_t row, uint8_t count, uint8_t attr);
unsigned char input_poll(void);
void button_draw(const struct gui_button *button) __z88dk_fastcall;
uint8_t button_at(const struct gui_button *table, uint8_t count);
uint8_t button_key(const struct gui_button *table, uint8_t count, unsigned char key);
void message_show(unsigned char *message) __z88dk_fastcall;
void title_draw(void);
uint8_t modal_ask(unsigned char **lines, uint8_t lineCount, const struct gui_button *buttons, uint8_t count);
void tm_cut(uint8_t col, uint8_t row, unsigned char *text, uint8_t width, uint8_t attr);

void os_give(void);
void os_take(void);
void *os_call(uint8_t bank, void *(*fn)(void *), void *data);
void gui_suspend(void);
void ula_store(void);
void ula_restore(void);
void gui_resume(void);

void gui_open(void);
void gui_close(void);
void spun_gui(void);

#endif
