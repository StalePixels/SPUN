#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_app/app.h"
#include "screen.h"

#define SPLASH_COLUMNS  5
#define SPLASH_ROWS     64
#define SPLASH_TOP      96
#define SPLASH_ENTRY    246
#define SPLASH_MOVES    ((SPLASH_ENTRY - SPLASH_TOP) / 2)
#define SPLASH_STAGGER  5

static const unsigned char letters[] = "SPUN";
static const unsigned char *const words[] = { "STALE", "PIXELS", "UPDATES", "NEXTS" };
static const uint8_t colours[] = { 0xE0, 0xFC, 0x1C, 0x1F };
static uint8_t clipSplash[] = { 0, 159, 8, 247 };

// zxnDMA (port $6B, which counts exactly): memory to memory, both addresses going up, stop at the end.
// The reset first: without it the first transfers ran about 4 times slower in MAME
static const uint8_t dmaSetup[] = { 0x83, 0xC3, 0x54, 0x02, 0x50, 0x02, 0x82 };

uint8_t splashLength;

static uint8_t glyphs[26][8];
uint8_t splashRow[64];

// Letters are 8 times the ROM font and the words twice as high: both even, so the two rows a frame
// brings in are the same row
static void row_make(uint8_t column, uint8_t row) {
    uint8_t *pixel = splashRow;
    const unsigned char *word;
    uint8_t colour;
    uint8_t glyph;
    uint8_t mask;

    if(column != SPLASH_COLUMNS - 1) {
        glyph = glyphs[letters[column] - 'A'][row >> 3];
        colour = colours[column];
        for(mask = 0x80; mask; mask >>= 1, pixel += 8) memset(pixel, glyph & mask ? colour : 0, 8);
        return;
    }
    word = words[row >> 4];
    colour = colours[row >> 4];
    memset(splashRow, 0, sizeof(splashRow));
    pixel += (64 - strlen(word) * 8) / 2;
    for(; *word; word++) {
        glyph = glyphs[*word - 'A'][(row & 15) >> 1];
        for(mask = 0x80; mask; mask >>= 1) *pixel++ = glyph & mask ? colour : 0;
    }
}

// The last picture holds for half a second before the GUI: 25 frames at 50 Hz, 30 at 60 Hz (NR 0x05 bit 2)
void splash(void) {
    uint8_t mmu2 = ZXN_READ_REG(REG_MMU0 + 2);
    uint8_t mmu3 = ZXN_READ_REG(REG_MMU0 + 3);
    uint16_t frame;
    int16_t step;
    uint8_t column;
    uint8_t index;

    im2_quiet();
    pointer_hide();
    ZXN_WRITE_MMU2(10);
    memcpy(glyphs, (uint8_t *)0x5C00 + 'A' * 8, sizeof(glyphs));
    layer2_clear();
    tilemap_off();
    layer2_on(LAYER2_320);
    clip_write(clipSplash);
    for(index = 0; index != sizeof(dmaSetup); index++) IO_DMA = dmaSetup[index];

    for(frame = 0; frame <= (SPLASH_COLUMNS - 1) * SPLASH_STAGGER + SPLASH_MOVES; frame++) {
        intrinsic_halt();
        for(column = 0; column != SPLASH_COLUMNS; column++) {
            step = (int16_t)frame - column * SPLASH_STAGGER;
            if(step < 0 || step > SPLASH_MOVES) continue;
            ZXN_WRITE_MMU2(layer2Page + column * 2);
            ZXN_WRITE_MMU3(layer2Page + column * 2 + 1);
            if(step) {
                splashLength = step * 2 > SPLASH_ROWS ? SPLASH_ROWS + 2 : step * 2 + 2;
                splash_dma(0x4000 + SPLASH_ENTRY + 2 - step * 2);
            }
            if(step * 2 >= SPLASH_ROWS) continue;
            row_make(column, step * 2);
            splash_row(splashRow);
        }
    }
    IO_DMA = 0x83;
    for(frame = ZXN_READ_REG(0x05) & 0x04 ? 30 : 25; frame; frame--) intrinsic_halt();

    ZXN_WRITE_MMU3(mmu3);
    ZXN_WRITE_MMU2(mmu2);
    layer2_off();
    clip_write(clip320);
    tilemap_on();
    im2_on();
}
