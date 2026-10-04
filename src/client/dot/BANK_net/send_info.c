#include "../common/spun.h"
#include "net.h"
#include "reply.h"

unsigned char *send_info(char *id) __z88dk_fastcall {
    unsigned char *error;

    sprintf(nbnBuff, "SPINFO %s %u\x0A", id, page);
    if((error = reply_request())) return error;

    *username = *title = *description = *suggestDir = 0;
    downloads = 0;

    reply_counts();
    while(reply_field()) {
        if(replyTag == TAG_USERNAME) reply_text(username, sizeof(username));
        else if(replyTag == TAG_TITLE) reply_text(title, sizeof(title));
        else if(replyTag == TAG_DESCRIPTION) reply_text(description, sizeof(description));
        else if(replyTag == TAG_DOWNLOADS) downloads = reply_number();
        else if(replyTag == TAG_APP_ID) reply_text(appid, sizeof(appid));
        else if(replyTag == TAG_INSTALL_DIR) reply_text(suggestDir, sizeof(suggestDir));
    }
    reply_rewind();
    return NULL;
}
