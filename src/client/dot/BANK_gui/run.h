#ifndef SPUN_RUN_H
#define SPUN_RUN_H

#include <stdint.h>

#define HEAD_ROW        3
#define LIST_ROW        4
#define LIST_ROWS       20
#define INPUT_ROW       27

#define COL_ID          1
#define COL_TITLE       8
#define COL_USER        41
#define COL_VERSION     58
#define VERSION_WIDTH   10
#define COL_DOWNLOADS   69

#define INPUT_COL       9

#define ACTION_PREV     0
#define ACTION_NEXT     1
#define ACTION_SEARCH   2
#define ACTION_CATEGORY 3
#define ACTION_HELP     4
#define ACTION_QUIT     5
#define ACTION_OPEN     6
#define ACTION_BACK     7

extern const struct gui_button listButtons[];
extern const uint8_t listButtonCount;
extern const struct gui_button pickButtons[];
extern const uint8_t pickButtonCount;
extern bool helpShown;
extern bool categoriesShown;
extern uint8_t listSel;
extern uint8_t listCount;
extern unsigned char categoryName[33];

void gui_run(void);
void gui_draw(void);
void help_toggle(void);
void page_show(void);
void entry_draw(uint8_t row) __z88dk_fastcall;
void status_show(void);
void buttons_show(void);
uint8_t buttons_key(unsigned char key) __z88dk_fastcall;
uint8_t buttons_click(void);
unsigned char search_run(void);
uint8_t category_key(unsigned char key, uint8_t action);
void list_select(uint8_t sel) __z88dk_fastcall;
uint8_t list_key(unsigned char key) __z88dk_fastcall;
uint8_t list_click(void);
bool app_open(void);
void updates_offer(void);

#endif
