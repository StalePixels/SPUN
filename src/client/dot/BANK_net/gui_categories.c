#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// text is not used: page_show calls this or page_request the same way
unsigned char *gui_categories(unsigned char *text) {
    unsigned char *error;

    (void)text;
    sprintf(nbnBuff, "SPCATS %u\x0A", page);
    if((error = reply_request())) return error;

    reply_counts();
    return NULL;
}
