#include "../common/spun.h"
#include "usage.h"

void help_and_exit(unsigned char *error) {
    printf(".spun " SPUN_VERSION "\n%s\n", help);

#ifdef __ZXNEXT
    ZXN_NEXTREGA(REG_TURBO_MODE, old_cpu_speed);
#endif
    if(error) NBN_Fail(error);
    exit(0);
}

void parse_page(char *text) {
    uint32_t value = 0;

    if(!*text) help_and_exit(err_invalid_option);
    for(; *text; text++) {
        if(!isdigit(*text)) help_and_exit(err_invalid_option);
        value = value * 10 + (*text - '0');
        if(value > 65535) help_and_exit(err_invalid_option);
    }
    if(!value) help_and_exit(err_invalid_option);

    page = value;
}
