#include "../common/spun.h"
#include "reply.h"

unsigned char *reply_request(void) {
    unsigned char *error;
    uint8_t retries = 3;

    while(1) {
        NET_Send(nbnBuff, strlen(nbnBuff));

        if((error = check_version())) return error;
        if(NET_GetUChar() != SPUN_FORMAT_VERSION) return err_wrong_version;

        NET_GetUInt16((uint8_t *)&replySize);
        if(replySize > NBN_MAX_BLOCKSIZE) NBN_Fail(err_nbn_protocol);
        if(NBN_GetBlock(replySize)) break;

        retries--;
        if(!retries) NBN_Fail(err_transfer_error);
    }
    reply_rewind();
    return NULL;
}
