#ifndef SPUN_MEMORY_H
#define SPUN_MEMORY_H

#include <stdint.h>

// Logical pages of the 16K banks, as the dotn page table counts them
#define BANK_NET        (47<<1)
#define BANK_PACKAGES   (46<<1)

#ifdef __ZXNEXT
extern unsigned char _z_page_table[];

void *_far(uint8_t bank, void *(*fn)(void));
void *_farWithPointer(uint8_t bank, void *(*fn)(void *), void *data);
#else
// The POSIX build has no banks
#define _far(bank, fn) ((fn)())
#define _farWithPointer(bank, fn, data) ((fn)(data))
#endif

#endif
