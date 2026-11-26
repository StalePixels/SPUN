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

static void count_make(unsigned char *count, uint32_t done, uint32_t total) {
    uint8_t length;

    *count = ' ';
    size_text(count + 1, done);
    length = strlen(count);
    count[length++] = '/';
    size_text(count + length, total);
}

static void line_make(unsigned char *line, uint8_t width, uint8_t stage, uint32_t done, uint32_t total, unsigned char *name) {
    unsigned char count[16];
    uint8_t length;

    if(stage == PROGRESS_UNZIP) {
        count_make(count, done, total);
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
// cover a longer one. Each file of an unzip starts a line with its name; only its count is written over
static void show(uint8_t stage, uint32_t done, uint32_t total, unsigned char *name) {
    unsigned char line[GUI_COLUMNS + 1];
    uint8_t length, width;

    if(guiOpen) {
        sprintf(line, "%s: ", title);
        length = strlen(line);
        line_make(line + length, GUI_COLUMNS - 2 - length, stage, done, total, name);
        tm_blank(0, STATUS_ROW, GUI_COLUMNS, ATTR_BAR);
        tm_text(1, STATUS_ROW, line, ATTR_BAR);
        return;
    }
    if(quiet) return;

    if(stage != PROGRESS_UNZIP) line_make(line, SCREEN_WIDTH - 1, stage, done, total, name);
    else {
        if(!done) {
            progress_end();
            count_make(line, total, total);
            width = SCREEN_WIDTH - 1 - strlen(line);
            for(length = 0; name[length] && length < width; length++) putchar(name[length]);
        }
        count_make(line, done, total);
    }
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
