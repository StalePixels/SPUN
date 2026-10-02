#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char *spun_find(char *text) {
    unsigned char *error;

    sprintf(nbnBuff, "SPFIND %u %s\x0A", page, text);
    if((error = reply_request())) return error;

    reply_counts();
    if(!totalItems) {
        printf("0 found\n");
        return NULL;
    }
    printf("%u found, page %u of %u\n\n", totalItems, page, totalPages);

    while(reply_field()) {
        if(replyTag != TAG_APP) continue;
        reply_app();
        printf("%s %.25s\n", appid, title);
    }
    return NULL;
}
