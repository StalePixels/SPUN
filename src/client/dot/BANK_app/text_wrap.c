#include "../common/spun.h"
#include "../gui/gui.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_screen/screen.h"
#include "app.h"

uint8_t text_wrap(unsigned char *text, uint8_t col, uint8_t row, uint8_t width, uint8_t rows) {
    unsigned char line[GUI_COLUMNS + 1];
    uint8_t used = 0;
    uint8_t length;
    uint8_t cut;

    while(*text && used != rows) {
        length = 0;
        while(text[length] && text[length] != '\n' && length != width) length++;
        cut = length;
        if(length == width && text[length] && text[length] != ' ' && text[length] != '\n') {
            while(cut && text[cut] != ' ') cut--;
            if(!cut) cut = length;
        }
        memcpy(line, text, cut);
        line[cut] = 0;
        tm_text(col, row + used++, line, ATTR_TEXT);
        text += cut;
        if(*text == ' ' || *text == '\n') text++;
    }
    return used;
}
