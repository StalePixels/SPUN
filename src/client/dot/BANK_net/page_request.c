#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char categorySlug[17];

// SPCAT with a category, else SPLIST with no text and SPFIND with it: the server refuses an empty SPFIND text
unsigned char *page_request(unsigned char *text) {
    unsigned char *error;
    unsigned char *at = nbnBuff;

    if(*categorySlug) at += sprintf(at, "SPCAT %s %u", categorySlug, page);
    else at += sprintf(at, *text ? "SPFIND %u" : "SPLIST %u", page);
    sprintf(at, *text ? " %s\x0A" : "\x0A", text);
    if((error = reply_request())) return error;

    reply_counts();
    return NULL;
}
