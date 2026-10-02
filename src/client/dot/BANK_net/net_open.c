#include "../common/spun.h"
#include "net.h"

#ifdef __ZXNEXT
static unsigned int prescalar;

static unsigned long uart_clock[] = { CLK_28_0, CLK_28_1, CLK_28_2, CLK_28_3, CLK_28_4, CLK_28_5, CLK_28_6, CLK_28_7 };
#endif

void net_open(void) {
#ifdef __ZXNEXT
    IO_NEXTREG_REG = REG_VIDEO_TIMING;
    prescalar = uart_clock[IO_NEXTREG_DAT] / 115200UL;

    IO_UART_BAUD_RATE = prescalar & 0x7f;
    IO_UART_BAUD_RATE = ((prescalar >> 7) & 0x7f) | 0x80;

    errno = 0;
    errno = NET_GetOK(false);

    if(errno) {
        printf("Closing Existing connections...\n");
        NET_Close(true);
    }
#endif

    printf("Opening %s\n", netServer);

    NET_Connect(netServer, netPort);

#ifdef __ZXNEXT
    errno = UART_WaitOK(false);

    if(errno) {
        NBN_Fail(err_failed_connection);
    }

    NET_ModeSingle();

    NET_OpenSocket();

    errno = 255;
    while (1) {
        errno--;
        unsigned char okflag = NET_GetUChar();

        if (okflag == '>') {
            break;
        }

        if (errno==0) {
            NBN_Fail(err_failed_connection);
        }
    }
#endif
}
