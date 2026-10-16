#ifndef SPUN_MEMORY_H
#define SPUN_MEMORY_H

#include <stdint.h>

// Logical pages of the 16K banks, as the dotn page table counts them
#define BANK_PACKAGES   (46<<1)
#define BANK_GUI        (44<<1)
#define BANK_SPRITES    (43<<1)
#define BANK_APP        (42<<1)

// The GUI, screen, UI and network code share one bank
#define BANK_SCREEN     BANK_GUI
#define BANK_UI         BANK_GUI
#define BANK_NET        BANK_GUI

// zsdcc misreads a function pointer type written inside a cast, so casts use these names
typedef void *(*far_fn_t)(void);
typedef void *(*far_ptr_fn_t)(void *);

#ifdef __ZXNEXT
extern unsigned char _z_page_table[];

void *_far(uint8_t bank, far_fn_t fn);
void *_farWithPointer(uint8_t bank, far_ptr_fn_t fn, void *data);
#else
// The POSIX build has no banks
#define _far(bank, fn) ((fn)())
#define _farWithPointer(bank, fn, data) ((fn)(data))
#endif

#endif
