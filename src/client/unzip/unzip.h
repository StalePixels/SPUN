#ifndef _UNZIP_H
#define _UNZIP_H

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

extern unsigned char unzip(const char *zip_path, const char *dir_path);

#endif
