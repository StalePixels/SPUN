#include "../common/spun.h"
#include "gui.h"

// IDE_DOS_MAPPING is an M_P3DOS call, so NextZXOS has its tile area back for it, with the tilemap
// hidden meanwhile. Interrupts stay as the caller has them
unsigned int os_mapping(unsigned char drive) __z88dk_fastcall {
    uint8_t tilemap;
    unsigned int unit;

    if(!tilemapIn) return dos_mapping(drive);
    tilemap = ZXN_READ_REG(0x6B);
    ZXN_NEXTREGA(0x6B, tilemap & 0x7F);
    tiles_give();
    unit = dos_mapping(drive);
    tiles_take();
    ZXN_NEXTREGA(0x6B, tilemap);
    return unit;
}
