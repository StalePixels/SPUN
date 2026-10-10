#include "../common/spun.h"
#include "gui.h"
#include "../BANK_ui/ui.h"

static struct modal modal;

static void text_copy(unsigned char *to, unsigned char *from, uint8_t width) {
    while(width-- && *from && *from != '\n') *to++ = *from++;
    *to = 0;
}

// The UI bank replaces the caller's bank at $C000, so what the box shows is copied to main memory first
uint8_t modal_ask(unsigned char *title, unsigned char **lines, uint8_t lineCount, const struct modal_button *buttons, uint8_t count) {
    uint8_t index;

    text_copy(modal.title, title, MODAL_TITLE);
    for(index = 0; index != lineCount && index != MODAL_LINES; index++) text_copy(modal.lines[index], lines[index], MODAL_TEXT);
    modal.lineCount = index;
    for(index = 0; index != count && index != MODAL_BUTTONS; index++) {
        text_copy(modal.labels[index], (unsigned char *)buttons[index].label, MODAL_LABEL);
        modal.shortcuts[index] = buttons[index].shortcut;
        modal.inks[index] = buttons[index].ink;
    }
    modal.count = index;
    return (uint8_t)(uint16_t)_farWithPointer(BANK_UI, (void *(*)(void *))modal_run, &modal);
}
