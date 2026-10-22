#pragma output REGISTER_SP = 0xBFD8
#pragma output CLIB_EXIT_STACK_SIZE = 1
// CACHE_PAGES (gui/gui.h): the loader allocates them, and the CRT frees them on any exit
#pragma output DOTN_NUM_EXTRA = 2
// The top page of the highest bank, BANK_PACKAGES (common/memory.h). The page tables and the extra pages must fit in 224
#pragma output DOTN_LAST_PAGE = 93
#pragma printf = "%lu %s %u %x %c"
