#include "../common/spun.h"
#include "net.h"

// LOG has no reply, so nothing is read after it
static char logVersion[] = "LOG version=" SPUN_VERSION "\x0A";

#ifdef __ZXNEXT
static unsigned int prescalar;

static unsigned long uart_clock[] = { CLK_28_0, CLK_28_1, CLK_28_2, CLK_28_3, CLK_28_4, CLK_28_5, CLK_28_6, CLK_28_7 };

// nbnBuff gets "LOG espat=", the AT+GMR line that starts "AT version:" without its CR, cut at 127 bytes, and LF
static void espat_read(void) {
    unsigned char *line = nbnBuff + 10;
    unsigned char byte;
    uint8_t length;

    nbnBuff[0] = 0;
    NET_Send("AT+GMR\x0D\x0A", 8);
    for(;;) {
        length = 0;
        while((byte = NET_GetUChar()) != '\n') {
            if(byte != '\r' && length != 127) line[length++] = byte;
        }
        line[length] = 0;
        if(!strncmp(line, "AT version:", 11)) {
            memcpy(nbnBuff, "LOG espat=", 10);
            line[length] = '\x0A';
            line[length + 1] = 0;
            NET_WaitOK(false);
            return;
        }
        if(!strcmp(line, "OK") || !strcmp(line, "ERROR")) return;
    }
}
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
        if(!quiet) printf("Closing Existing connections...\n");
        NET_Close(true);
    }

    espat_read();
#endif

    if(!quiet) printf("Opening %s\n", netServer);

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

    NET_Send(logVersion, sizeof(logVersion) - 1);
#ifdef __ZXNEXT
    if(nbnBuff[0]) NET_Send(nbnBuff, strlen(nbnBuff));
#endif
    NBN_SetBlockSize(NBN_LARGE_BLOCKSIZE);
}
