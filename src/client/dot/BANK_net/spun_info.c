#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char *spun_info(char *id) {
    unsigned char *error;

    if((error = send_info(id))) return error;

    printf("%s\nby %s\n\n", title, username);
    if(*description) {
        print_wrapped(description);
        printf("\n");
    }
    printf("%u releases, page %u of %u\n\n", totalItems, page, totalPages);

    while(reply_field()) {
        if(replyTag != TAG_RELEASE) continue;
        reply_release();
        printf("%s %s\n", version, date);
    }
    return NULL;
}
