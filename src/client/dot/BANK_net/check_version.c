#include "../common/spun.h"
#include "reply.h"

static unsigned char serverError[33];

// Not NBN_CheckVersionByte: it prints the server's error text. The error comes back to the
// caller, and the rest of the error line is read, so a later caller can go on to the next app
unsigned char *check_version(void) {
    unsigned char chr = NET_GetUChar();
    uint8_t at = 0;

    if(chr == NBN_PROTOCOL_VERSION) return NULL;
    if(!(chr & 64)) return err_wrong_version;

    while(chr != '\x0A') {
        if(chr != '\x0D' && at + 1 < sizeof(serverError)) serverError[at++] = chr;
        chr = NET_GetUChar();
    }
    serverError[at] = 0;

    if(strcmp(serverError, "NoApp_ERROR") == 0) return err_no_app;
    if(strcmp(serverError, "BadQuery_ERROR") == 0) return err_bad_query;
    if(strcmp(serverError, "NoFile_ERROR") == 0) return err_no_file;
    if(strcmp(serverError, "NoRelease_ERROR") == 0) return err_no_release;
    return err_server_error;
}
