#include <arch/zxn/esxdos.h>
#include <errno.h>

#include "inflate.h"

// B and W0-W3. The program's loader has already loaded pages A and C
static const unsigned char slot[UNZIP_PAGES] = { 1, 3, 4, 5, 6 };

// The M_P3DOS calls, apart from unzip.c, so that a program can keep them in main
// memory and still build unzip.c into a bank. Returns the number of pages allocated
unsigned char unzip_pages_alloc(struct inflate_job *job) {
    unsigned char pages;

    for (pages = 0; pages < UNZIP_PAGES; pages++) {
        errno = 0;
        job->page[slot[pages]] = esx_ide_bank_alloc(ESX_BANKTYPE_RAM);
        if (errno) break;
    }
    job->page[0] = inflate_page(INFLATE_PAGE_A);
    job->page[2] = inflate_page(INFLATE_PAGE_C);
    return pages;
}

void unzip_pages_free(struct inflate_job *job, unsigned char pages) {
    while (pages) esx_ide_bank_free(ESX_BANKTYPE_RAM, job->page[slot[--pages]]);
}
