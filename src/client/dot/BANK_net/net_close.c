#include "../common/spun.h"
#include "net.h"

// For shutdown() in main, which reaches the bank only through the trampoline
void net_close(void) {
    NET_Close(true);
}
