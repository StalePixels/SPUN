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
#define ACTION_HELP     3
#define ACTION_QUIT     4
#define ACTION_OPEN     5

extern const struct gui_button buttons[];
extern const uint8_t buttonCount;
extern bool helpShown;
extern uint8_t listSel;
extern uint8_t listCount;

void gui_run(void);
void gui_draw(void);
void help_toggle(void);
void page_show(void);
void entry_draw(uint8_t row) __z88dk_fastcall;
void status_show(void);
void search_run(void);
void list_select(uint8_t sel) __z88dk_fastcall;
uint8_t list_key(unsigned char key) __z88dk_fastcall;
uint8_t list_click(void);
bool app_open(void);
void updates_offer(void);

#endif
