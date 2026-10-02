#include "../common/spun.h"
#include "net.h"
#include "reply.h"

// SPLIST with no text, SPFIND with it: the server refuses an empty SPFIND text
unsigned char *page_request(unsigned char *text) {
    unsigned char *error;

    if(*text) sprintf(nbnBuff, "SPFIND %u %s\x0A", page, text);
    else sprintf(nbnBuff, "SPLIST %u\x0A", page);
    if((error = reply_request())) return error;

    reply_counts();
    return NULL;
}
