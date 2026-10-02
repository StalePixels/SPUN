#ifndef SPUN_SCREEN_H
#define SPUN_SCREEN_H

#include <stdint.h>

struct l2_target;

#define SCREEN_REGS 15
#define SAVED_15    0
#define SAVED_68    2

extern const uint8_t screenRegs[SCREEN_REGS];
extern uint8_t screenSaved[SCREEN_REGS];
extern uint8_t clipSaved[4];
extern uint8_t paletteSaved[512];
extern uint8_t clip320[];

void font_load(void);
void screen_on(void);
void screen_off(void);
void clip_write(uint8_t *clip) __z88dk_fastcall;
void palette_default(void);
void layer2_on(uint8_t mode);
void layer2_off(void);
void layer2_clear(void);
void tilemap_on(void);
void tilemap_off(void);
void placeholder_draw(struct l2_target *rect);
void splash(void);
void splash_dma(uint16_t from) __z88dk_fastcall;
void splash_row(uint8_t *row) __z88dk_fastcall;

#endif
