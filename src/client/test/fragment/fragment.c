// A test tool for mame-nolayer2.sh, not part of .spun. NextZXOS 8K pages, through IDE_BANK:
//   .fragment         takes every free page, then gives back those of every even 16K bank,
//                     so that no free run of 10 pages is left; it writes how many it gave back
//                     to C:/fragment.txt
//   .fragment check   counts the free pages (takes them all, gives them all back) and prints
//                     FRAGMENT SAME if the count is the one in C:/fragment.txt, else FRAGMENT CHANGED
#include <arch/zxn.h>
#include <arch/zxn/esxdos.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define FILE_NAME "C:/fragment.txt"

static unsigned char taken[256];

static unsigned int take_all(void) {
    unsigned int count = 0;
    unsigned char page;

    while((page = esx_ide_bank_alloc(0)) != 0xFF) taken[count++] = page;
    return count;
}

int main(int argc, char **argv) {
    unsigned char text[8];
    unsigned char file;
    unsigned int count = take_all();
    unsigned int left = 0;
    unsigned int index;

    if(argc > 1 && !strcmp(argv[1], "check")) {
        for(index = 0; index != count; index++) esx_ide_bank_free(0, taken[index]);
        file = esxdos_f_open(FILE_NAME, ESXDOS_MODE_R);
        memset(text, 0, sizeof(text));
        esxdos_f_read(file, text, sizeof(text) - 1);
        esxdos_f_close(file);
        printf("FREE %u, BEFORE %s\n", count, text);
        printf(count == atoi(text) ? "FRAGMENT SAME\n" : "FRAGMENT CHANGED\n");
        return 0;
    }

    for(index = 0; index != count; index++) {
        if((taken[index] >> 1) & 1) continue;
        esx_ide_bank_free(0, taken[index]);
        left++;
    }
    sprintf(text, "%u", left);
    file = esxdos_f_open(FILE_NAME, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    esxdos_f_write(file, text, strlen(text));
    esxdos_f_close(file);
    printf("FRAGMENTED, %u FREE\n", left);
    return 0;
}
