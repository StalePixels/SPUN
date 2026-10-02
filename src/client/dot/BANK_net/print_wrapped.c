#include "../common/spun.h"
#include "net.h"

void print_wrapped(unsigned char *text) __z88dk_fastcall {
    uint16_t length;
    uint8_t cut;
    unsigned char kept;

    while(*text) {
        while(*text == ' ') text++;
        length = strlen((char *)text);
        if(length <= SCREEN_WIDTH) {
            printf("%s\n", text);
            return;
        }

        for(cut = SCREEN_WIDTH; cut && text[cut] != ' '; cut--);
        if(!cut) cut = SCREEN_WIDTH;

        kept = text[cut];
        text[cut] = 0;
        printf("%s\n", text);
        text[cut] = kept;
        text += cut;
    }
}
