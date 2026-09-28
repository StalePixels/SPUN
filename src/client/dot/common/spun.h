#ifndef SPUN_H
#define SPUN_H

#ifndef __ZXNEXT
#include <inttypes.h>
#else
#include <z80.h>
#include <arch/zxn.h>
#include <intrinsic.h>
#include <arch/zxn/esxdos.h>
#include <arch/zxn/sysvar.h>
#include <input.h>
#endif

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#include "../help.h"
#include "../spun_messages.h"
#include "../../unzip/unzip.h"
#include "../../../vendor/NBNtools/clients/common/messages.h"
#include "../../../vendor/NBNtools/clients/common/util.h"
#include "../../../vendor/NBNtools/clients/common/uart.h"
#include "../../../vendor/NBNtools/clients/common/net.h"
#include "../../../vendor/NBNtools/clients/common/nbn.h"

#include "memory.h"
#include "file.h"

#ifndef __ZXNEXT
extern bool card_mkdir(const char *dir);

#define NOT_FOUND ENOENT
#define IO_ERROR EIO
#else
#define NOT_FOUND ESX_ENOENT
#define IO_ERROR ESX_EIO
#endif

#define SCREEN_WIDTH 32

// Shared by main and the banks, so it lives in main memory
extern char *netServer;
extern char *netPort;
extern uint16_t page;
extern uint32_t counter;
extern unsigned char username[17];
extern unsigned char title[33];
extern unsigned char appid[7];
extern uint16_t serial;
extern unsigned char version[17];
extern unsigned char installDir[256];
extern unsigned char zipPath[24];
extern bool getInstalled;

bool choose_dir(void);

#ifdef __ZXNEXT
void check_install_drive(void);
#else
#define check_install_drive()
#endif

#ifdef __ZXNEXT
extern unsigned char old_cpu_speed;
#endif

#endif
