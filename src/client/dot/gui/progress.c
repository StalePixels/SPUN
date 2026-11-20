#include "../common/spun.h"
#include "gui.h"

// The columns of the CLI's line that progress writes over
static uint8_t shown;

static void size_text(unsigned char *text, uint32_t bytes) {
    uint32_t k = bytes >> 10;
    uint16_t tenths;

    if(k < 1024) sprintf(text, "%uK", (uint16_t)k);
    else {
        tenths = (k * 10) >> 10;
        sprintf(text, "%u.%uM", tenths / 10, tenths % 10);
    }
}

static void line_make(unsigned char *line, uint8_t width, uint8_t stage, uint32_t done, uint32_t total, unsigned char *name) {
    unsigned char count[16];
    uint8_t length;

    if(stage == PROGRESS_UNZIP) {
        *count = ' ';
        size_text(count + 1, done);
        length = strlen(count);
        count[length++] = '/';
        size_text(count + length, total);
        length = strlen(name);
        if(length > width - strlen(count)) length = width - strlen(count);
        memcpy(line, name, length);
        strcpy(line + length, count);
    } else {
        sprintf(line, "Downloading block %u of %u: ", (uint16_t)done, (uint16_t)total);
        length = strlen(line);
        if(length < width) strncpy(line + length, name, width - length);
    }
    line[width] = 0;
}

// The CLI's ROM output drops \r, so the line goes back with code 8 for each column, and spaces
// cover a longer one
static void show(uint8_t stage, uint32_t done, uint32_t total, unsigned char *name) {
    unsigned char line[GUI_COLUMNS + 1];
    uint8_t length;

    if(guiOpen) {
        line_make(line, GUI_COLUMNS - 2, stage, done, total, name);
        tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_BAR);
        tm_text(1, STATUS_ROW, line, ATTR_BAR);
        return;
    }
    if(quiet) return;

    line_make(line, SCREEN_WIDTH - 1, stage, done, total, name);
    for(length = shown; length; length--) putchar(8);
    fputs(line, stdout);
    for(length = strlen(line); length < shown; length++) putchar(' ');
    shown = length;
}

// Called between blocks and between files, with interrupts off. The download's call stays 16-bit:
// its bank has no room for wider arguments
void progress(uint8_t stage, uint16_t done, uint16_t total, unsigned char *name) {
    show(stage, done, total, name);
}

void progress_bytes(uint32_t done, uint32_t total, unsigned char *name) {
    show(PROGRESS_UNZIP, done, total, name);
}

void progress_end(void) {
    if(shown) putchar('\n');
    shown = 0;
}
