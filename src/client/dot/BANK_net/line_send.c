#include "../common/spun.h"
#include "net.h"

// A line in nbnBuff that has no reply, such as LOG
void line_send(void) {
    NET_Send(nbnBuff, strlen(nbnBuff));
}
