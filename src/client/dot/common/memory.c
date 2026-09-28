#include "memory.h"

#include <arch/zxn.h>

// Banked code runs at $C000-$FFFF. The caller's MMU6-7 are put back on return
void *_far(uint8_t bank, void *(*fn)(void)) {
    uint8_t bottom = ZXN_READ_REG(REG_MMU0 + 6);
    uint8_t top = ZXN_READ_REG(REG_MMU0 + 7);
    void *result;

    ZXN_WRITE_MMU6(_z_page_table[bank]);
    ZXN_WRITE_MMU7(_z_page_table[bank + 1]);
    result = fn();
    ZXN_WRITE_MMU6(bottom);
    ZXN_WRITE_MMU7(top);
    return result;
}

void *_farWithPointer(uint8_t bank, void *(*fn)(void *), void *data) {
    uint8_t bottom = ZXN_READ_REG(REG_MMU0 + 6);
    uint8_t top = ZXN_READ_REG(REG_MMU0 + 7);
    void *result;

    ZXN_WRITE_MMU6(_z_page_table[bank]);
    ZXN_WRITE_MMU7(_z_page_table[bank + 1]);
    result = fn(data);
    ZXN_WRITE_MMU6(bottom);
    ZXN_WRITE_MMU7(top);
    return result;
}
