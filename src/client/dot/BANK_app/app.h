#ifndef SPUN_APP_H
#define SPUN_APP_H

#include <stdint.h>
#include <stdbool.h>

struct l2_target;
struct gui_button;

#define SLOTS               5

// The thumbnail sizes of the CMS (THUMB_SIZES, src/web/src/lib/thumbs.ts): slot 1 big, the others small
#define THUMB_BIG_W         128
#define THUMB_BIG_H         96
#define THUMB_SMALL_W       64
#define THUMB_SMALL_H       48

#define THUMB_X             4
#define THUMB_Y             16
#define THUMB_GAP           4
#define THUMB_PER_COLUMN    (THUMB_BIG_H / THUMB_SMALL_H)
#define THUMB_COLUMNS       ((SLOTS - 2) / THUMB_PER_COLUMN + 1)
#define THUMB_RIGHT         (THUMB_X + THUMB_BIG_W + THUMB_COLUMNS * (THUMB_GAP + THUMB_SMALL_W))

#define INFO_COL            (THUMB_RIGHT / 4 + 1)
#define TEXT_ROW            ((THUMB_Y + THUMB_BIG_H) / 8 + 1)
#define TEXT_END            (STATUS_ROW - 1)
#define REL_COL             52
#define COL_REL_DATE        (REL_COL + 17)
#define REL_BAR_COL         (REL_COL - 1)
#define REL_BAR_WIDTH       (GUI_COLUMNS - REL_BAR_COL)
#define LEFT_WIDTH          (REL_BAR_COL - 2)
#define REL_HEAD_ROW        TEXT_ROW
#define REL_ROW             (REL_HEAD_ROW + 1)
#define REL_ROWS            (TEXT_END - REL_ROW)
#define HINT_ROW            27
#define CLOG_ROW            5
#define CLOG_ROWS           (BUTTON_ROW - 1 - CLOG_ROW)
#define TEXT_WIDTH          (GUI_COLUMNS - 2)

#define LAYER2_256          0x00
#define LAYER2_320          0x10

#define CHANGELOG_LENGTH    1024

#define APP_BACK            0
#define APP_CHANGELOG       1
#define APP_QUIT            2
#define APP_INSTALL         3

extern const struct gui_button appButtons[];
extern const uint8_t appButtonCount;

// Main memory, where the net bank writes them
extern uint16_t shotWidth[SLOTS];
extern unsigned char categoryText[96];
extern uint16_t releaseCount;
extern uint8_t releaseRows;
extern unsigned char changelog[CHANGELOG_LENGTH + 1];

extern uint8_t relSel;
extern uint8_t relTop;

unsigned char *app_run(void);
bool app_show(bool pictures) __z88dk_fastcall;
void info_draw(void);
void releases_draw(void);
void release_select(uint8_t sel) __z88dk_fastcall;
void thumb_rect(uint8_t slot, struct l2_target *rect);
uint8_t thumb_at(void);
unsigned char *thumbs_load(bool load) __z88dk_fastcall;
uint8_t text_wrap(unsigned char *text, uint8_t col, uint8_t row, uint8_t width, uint8_t rows);
void buttons_draw(uint8_t count) __z88dk_fastcall;
void wait_back(void);
void clog_show(void);
unsigned char *view_show(uint8_t slot) __z88dk_fastcall;
void app_install(void);

#endif
