#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <zip.h>

#include "../unzip/unzip.h"
#include "../../vendor/NBNtools/clients/common/platform.h"

static zip_t *archive;
static zip_int64_t entries;
static char path[256];
static uint16_t dir_len;
static char dot[256];
static unsigned char buffer[8192];
static bool overwrite_all;

// The esxdos shim keeps its $HOME/.nbn mapping private and has no mkdir
bool card_mkdir(const char *dir) {
    const char *home = getenv("HOME");
    char buf[PATH_MAX];

    if ((dir[0] == 'C' || dir[0] == 'c') && dir[1] == ':') dir += 2;
    if (dir[0] == '/') {
        if (!home || !*home || snprintf(buf, PATH_MAX, "%s/.nbn%s", home, dir) >= PATH_MAX) return false;
        dir = buf;
    }
    if (mkdir(dir, 0755) == 0) return true;
    if (errno != EEXIST) return false;
    errno = 0;
    return true;
}

static unsigned char zip_result(int error) {
    switch (error) {
    case ZIP_ER_NOZIP:
    case ZIP_ER_INCONS:
    case ZIP_ER_TRUNCATED_ZIP:
        return UNZIP_E_FORMAT;
    case ZIP_ER_MULTIDISK:
    case ZIP_ER_COMPNOTSUPP:
    case ZIP_ER_ENCRNOTSUPP:
        return UNZIP_E_UNSUPPORTED;
    case ZIP_ER_MEMORY:
        return UNZIP_E_NOMEM;
    case ZIP_ER_ZLIB:
    case ZIP_ER_COMPRESSED_DATA:
    case ZIP_ER_EOF:
        return UNZIP_E_DATA;
    case ZIP_ER_CRC:
    case ZIP_ER_DATA_LENGTH:
        return UNZIP_E_CHECK;
    default:
        return UNZIP_E_READ;
    }
}

static unsigned char entry_name(zip_uint64_t index) {
    const char *name = zip_get_name(archive, index, ZIP_FL_ENC_RAW);
    size_t name_len;

    if (!name) return zip_result(zip_error_code_zip(zip_get_error(archive)));
    name_len = strlen(name);
    if (name_len == 0 || dir_len + 1 + name_len >= sizeof(path)) return UNZIP_E_PATH;
    memcpy(path + dir_len + 1, name, name_len + 1);
    return UNZIP_OK;
}

// The same rules as unzip.c: a leading slash, a drive letter (any colon) or a
// ".." component could write outside the target directory
static unsigned char check_entry(zip_uint64_t index) {
    const char *name = path + dir_len + 1;
    const char *p = name;
    const char *part;
    zip_stat_t st;

    if (zip_stat_index(archive, index, ZIP_FL_ENC_RAW, &st)) return zip_result(zip_error_code_zip(zip_get_error(archive)));
    if (st.encryption_method != ZIP_EM_NONE) return UNZIP_E_UNSUPPORTED;
    if (st.comp_method != ZIP_CM_STORE && st.comp_method != ZIP_CM_DEFLATE) return UNZIP_E_UNSUPPORTED;
    if (st.comp_size >= 0xffffffff || st.size >= 0xffffffff) return UNZIP_E_UNSUPPORTED;
    if (name[0] == '/' || name[0] == '\\' || strchr(name, ':')) return UNZIP_E_PATH;
    while (*p) {
        part = p;
        while (*p && *p != '/' && *p != '\\') p++;
        if (p - part == 2 && part[0] == '.' && part[1] == '.') return UNZIP_E_PATH;
        if (*p) p++;
    }
    return UNZIP_OK;
}

// The same rule as unzip.c: a .dot file at the root of the zip goes to C:/dot without its extension
static bool dot_target(void) {
    const char *name = path + dir_len + 1;
    size_t len = strlen(name);

    if (len < 5 || strpbrk(name, "/\\") || strcasecmp(name + len - 4, ".dot")) return false;
    snprintf(dot, sizeof(dot), "C:/dot/%.*s", (int)(len - 4), name);
    return true;
}

static unsigned char check_existing(void) {
    const char *target = dot_target() ? dot : path;
    unsigned char answer;
    uint8_t fd;

    if (overwrite_all || path[strlen(path) - 1] == '/') return UNZIP_OK;
    errno = 0;
    fd = esxdos_f_open(target, ESXDOS_MODE_R);
    if (errno) return UNZIP_OK;
    esxdos_f_close(fd);
    answer = overwrite_ask(target);
    if (answer == OVERWRITE_CANCEL) return UNZIP_E_ABORT;
    if (answer == OVERWRITE_ALL) overwrite_all = true;
    return UNZIP_OK;
}

// The pretend card is all drive C:, so a rename always moves the file. Unlike a Next's card it may have no /dot
static unsigned char move_dot(void) {
    if (!card_mkdir("/dot")) return UNZIP_E_CREATE;
    esxdos_f_unlink(dot);
    errno = 0;
    return esx_f_rename(path, dot) ? UNZIP_E_CREATE : UNZIP_OK;
}

static unsigned char make_dirs(char *end) {
    char *p;
    bool made;

    for (p = path + dir_len + 1; p < end; p++) {
        if (*p != '/') continue;
        *p = 0;
        errno = 0;
        made = card_mkdir(path);
        *p = '/';
        if (!made) return UNZIP_E_CREATE;
    }
    return UNZIP_OK;
}

static unsigned char copy_entry(zip_file_t *in, uint8_t out) {
    zip_int64_t got;

    while ((got = zip_fread(in, buffer, sizeof(buffer))) > 0) {
        errno = 0;
        if (esxdos_f_write(out, buffer, (uint16_t)got) != got || errno) return UNZIP_E_WRITE;
    }
    if (got < 0) return zip_result(zip_error_code_zip(zip_file_get_error(in)));
    return UNZIP_OK;
}

static unsigned char extract_entry(zip_uint64_t index) {
    size_t len = strlen(path);
    zip_file_t *in;
    uint8_t out;
    unsigned char r;
    int error;

    if ((r = make_dirs(path + len))) return r;
    if (path[len - 1] == '/') return UNZIP_OK;
    in = zip_fopen_index(archive, index, 0);
    if (!in) return zip_result(zip_error_code_zip(zip_get_error(archive)));
    errno = 0;
    out = esxdos_f_open(path, ESXDOS_MODE_W | ESXDOS_MODE_CT);
    if (errno) {
        error = errno;
        zip_fclose(in);
        errno = error;
        return UNZIP_E_CREATE;
    }
    r = copy_entry(in, out);
    error = errno;
    zip_fclose(in);
    errno = 0;
    if (close(out) && r == UNZIP_OK) return UNZIP_E_WRITE;
    if (r != UNZIP_OK) {
        esxdos_f_unlink(path);
        errno = error;
    }
    return r;
}

unsigned char unzip(const char *zip_path, const char *dir_path) {
    unsigned char r = UNZIP_OK;
    uint8_t fd;
    int error;
    zip_int64_t e;

    overwrite_all = false;
    dir_len = strlen(dir_path);
    while (dir_len && dir_path[dir_len - 1] == '/') dir_len--;
    if (dir_len + 2 >= sizeof(path)) return UNZIP_E_PATH;
    memcpy(path, dir_path, dir_len);
    path[dir_len] = '/';

    errno = 0;
    fd = esxdos_f_open(zip_path, ESXDOS_MODE_R);
    if (errno) return UNZIP_E_READ;
    if (!(archive = zip_fdopen(fd, 0, &error))) {
        r = zip_result(error);
        error = errno;
        esxdos_f_close(fd);
        errno = error;
        return r;
    }

    entries = zip_get_num_entries(archive, 0);
    for (e = 0; r == UNZIP_OK && e < entries; e++) {
        r = entry_name(e);
        if (r == UNZIP_OK) r = check_entry(e);
        if (r == UNZIP_OK) r = check_existing();
    }
    for (e = 0; r == UNZIP_OK && e < entries; e++) {
        r = entry_name(e);
        if (r == UNZIP_OK) r = extract_entry(e);
    }
    for (e = 0; r == UNZIP_OK && e < entries; e++) {
        r = entry_name(e);
        if (r == UNZIP_OK && dot_target()) r = move_dot();
    }

    error = errno;
    zip_discard(archive);
    errno = r ? error : 0;
    return r;
}
