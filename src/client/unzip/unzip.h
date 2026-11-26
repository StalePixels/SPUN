#ifndef _UNZIP_H
#define _UNZIP_H

#include <stdbool.h>

#define UNZIP_OK            0
#define UNZIP_E_NOMEM       1
#define UNZIP_E_READ        2
#define UNZIP_E_FORMAT      3
#define UNZIP_E_UNSUPPORTED 4
#define UNZIP_E_PATH        5
#define UNZIP_E_CREATE      6
#define UNZIP_E_WRITE       7
#define UNZIP_E_DATA        8
#define UNZIP_E_CHECK       9
#define UNZIP_E_ABORT       10

// overwrite_ask's answers: the keys that give them
#define OVERWRITE_ONCE      'o'
#define OVERWRITE_ALL       'a'
#define OVERWRITE_CANCEL    'c'
#define OVERWRITE_SKIP      's'

// unzip's flags. Without UNZIP_ASK_EACH it asks about every file that exists before it writes any
#define UNZIP_YES           0x01
#define UNZIP_JUNK          0x02
#define UNZIP_NO_MAC        0x04
#define UNZIP_ASK_EACH      0x08

#define PROGRESS_DOWNLOAD   0
#define PROGRESS_UNZIP      1
extern void progress(unsigned char stage, unsigned int done, unsigned int total, unsigned char *name);
extern void progress_bytes(unsigned long done, unsigned long total, unsigned char *name);
extern void progress_end(void);

extern unsigned char overwrite_ask(const char *name);

extern unsigned char unzip(const char *zip_path, const char *dir_path, unsigned char flags);
extern unsigned char unzip_view(const char *zip_path, unsigned char flags, void (*entry)(const char *name, unsigned long size));

#endif
