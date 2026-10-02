#include <arch/zxn/esxdos.h>
#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "inflate.h"
#include "unzip.h"

static struct inflate_job job;
static struct esx_stat st;
static unsigned char hdr[46];
static unsigned char local[30];
static unsigned char tail[256];
static char path[256];
static uint16_t dir_len;
static uint16_t entries;
static uint32_t cd_offset;
static uint32_t cd_pos;
static unsigned char zip;

static uint16_t get16(const unsigned char *p) {
    return p[0] | ((uint16_t)p[1] << 8);
}

static uint32_t get32(const unsigned char *p) {
    return get16(p) | ((uint32_t)get16(p + 2) << 16);
}

static bool is_sig(const unsigned char *p, unsigned char a, unsigned char b) {
    return p[0] == 'P' && p[1] == 'K' && p[2] == a && p[3] == b;
}

// A short read is not an esxDOS error: the zip is shorter than its own records say
static unsigned char read_at(uint32_t pos, void *dst, uint16_t len) {
    uint16_t got;

    errno = 0;
    esx_f_seek(zip, pos, ESX_SEEK_SET);
    if (errno) return UNZIP_E_READ;
    got = esx_f_read(zip, dst, len);
    if (errno) return UNZIP_E_READ;
    return got == len ? UNZIP_OK : UNZIP_E_FORMAT;
}

#define EOCD_REACH (22 + 65535UL)

// Searches back as far as the largest archive comment allows, in overlapping
// reads, so a record that crosses the edge of one read is found in the next.
static unsigned char find_directory(void) {
    uint32_t size, stop, end;
    uint16_t len, i;
    unsigned char r;

    errno = 0;
    esx_f_fstat(zip, &st);
    if (errno) return UNZIP_E_READ;
    size = st.size;
    if (size < 22) return UNZIP_E_FORMAT;
    stop = size > EOCD_REACH ? size - EOCD_REACH : 0;
    for (end = size; end - stop >= 22; end -= len - 21) {
        len = end - stop < sizeof(tail) ? (uint16_t)(end - stop) : sizeof(tail);
        if ((r = read_at(end - len, tail, len))) return r;
        for (i = len - 21; i-- > 0;) {
            if (!is_sig(tail + i, 5, 6)) continue;
            if (get16(tail + i + 4) || get16(tail + i + 6)) return UNZIP_E_UNSUPPORTED;
            entries = get16(tail + i + 10);
            if (entries == 0xffff || get16(tail + i + 8) != entries) return UNZIP_E_UNSUPPORTED;
            cd_offset = get32(tail + i + 16);
            if (cd_offset == 0xffffffff) return UNZIP_E_UNSUPPORTED;
            return UNZIP_OK;
        }
    }
    return UNZIP_E_FORMAT;
}

static unsigned char next_entry(void) {
    uint16_t name_len;
    uint16_t got;
    unsigned char r;

    if ((r = read_at(cd_pos, hdr, sizeof(hdr)))) return r;
    if (!is_sig(hdr, 1, 2)) return UNZIP_E_FORMAT;
    name_len = get16(hdr + 28);
    if (name_len == 0 || dir_len + 1 + name_len >= sizeof(path)) return UNZIP_E_PATH;
    errno = 0;
    got = esx_f_read(zip, path + dir_len + 1, name_len);
    if (errno) return UNZIP_E_READ;
    if (got != name_len) return UNZIP_E_FORMAT;
    path[dir_len + 1 + name_len] = 0;
    cd_pos += sizeof(hdr) + name_len + get16(hdr + 30) + get16(hdr + 32);
    return UNZIP_OK;
}

// Refuses every name that could write outside the target directory: a
// leading slash, a drive letter (any colon) or a ".." component.
static unsigned char check_entry(void) {
    const char *name = path + dir_len + 1;
    const char *p = name;
    const char *part;
    uint16_t method = get16(hdr + 10);

    if (get16(hdr + 8) & 1) return UNZIP_E_UNSUPPORTED;
    if (method != 0 && method != 8) return UNZIP_E_UNSUPPORTED;
    if (get32(hdr + 20) == 0xffffffff || get32(hdr + 24) == 0xffffffff) return UNZIP_E_UNSUPPORTED;
    if (name[0] == '/' || name[0] == '\\' || strchr(name, ':')) return UNZIP_E_PATH;
    while (*p) {
        part = p;
        while (*p && *p != '/' && *p != '\\') p++;
        if (p - part == 2 && part[0] == '.' && part[1] == '.') return UNZIP_E_PATH;
        if (*p) p++;
    }
    return UNZIP_OK;
}

static unsigned char make_dirs(char *end) {
    char *p;

    for (p = path + dir_len + 1; p < end; p++) {
        if (*p != '/') continue;
        *p = 0;
        errno = 0;
        esx_f_mkdir(path);
        *p = '/';
        if (errno == ESX_EEXIST) errno = 0;
        if (errno) return UNZIP_E_CREATE;
    }
    return UNZIP_OK;
}

static unsigned char extract_entry(void) {
    uint16_t len = strlen(path);
    uint32_t offset;
    unsigned char out;
    unsigned char r;
    int error;

    if ((r = make_dirs(path + len))) return r;
    if (path[len - 1] == '/') return UNZIP_OK;
    offset = get32(hdr + 42);
    if ((r = read_at(offset, local, sizeof(local)))) return r;
    if (!is_sig(local, 3, 4)) return UNZIP_E_FORMAT;
    errno = 0;
    esx_f_seek(zip, offset + sizeof(local) + get16(local + 26) + get16(local + 28), ESX_SEEK_SET);
    if (errno) return UNZIP_E_READ;
    errno = 0;
    out = esx_f_open(path, ESX_MODE_WRITE | ESX_MODE_OPEN_CREAT_TRUNC);
    if (errno) return UNZIP_E_CREATE;
    job.in_handle = zip;
    job.out_handle = out;
    job.method = get16(hdr + 10);
    job.crc = get32(hdr + 16);
    job.csize = get32(hdr + 20);
    job.usize = get32(hdr + 24);
    job.diag[INFLATE_DIAG_ESXERR] = 0;
    r = inflate_call(&job);
    errno = r == UNZIP_E_READ || r == UNZIP_E_WRITE ? job.diag[INFLATE_DIAG_ESXERR] : 0;
    error = errno;
    esx_f_close(out);
    if (r == UNZIP_OK && errno) return UNZIP_E_WRITE;
    if (r != UNZIP_OK) {
        esx_f_unlink(path);
        errno = error;
    }
    return r;
}

unsigned char unzip(const char *zip_path, const char *dir_path) {
    unsigned char r;
    unsigned char pages = 0;
    uint16_t e;
    int error;

    dir_len = strlen(dir_path);
    while (dir_len && dir_path[dir_len - 1] == '/') dir_len--;
    if (dir_len + 2 >= sizeof(path)) return UNZIP_E_PATH;
    memcpy(path, dir_path, dir_len);
    path[dir_len] = '/';

    errno = 0;
    zip = esx_f_open(zip_path, ESX_MODE_READ | ESX_MODE_OPEN_EXIST);
    if (errno) return UNZIP_E_READ;

    r = find_directory();
    cd_pos = cd_offset;
    for (e = 0; r == UNZIP_OK && e < entries; e++) {
        r = next_entry();
        if (r == UNZIP_OK) r = check_entry();
    }

    if (r == UNZIP_OK && (pages = unzip_pages_alloc(&job)) < UNZIP_PAGES) r = UNZIP_E_NOMEM;

    if (r == UNZIP_OK) {
        cd_pos = cd_offset;
        for (e = 0; r == UNZIP_OK && e < entries; e++) {
            r = next_entry();
            if (r != UNZIP_OK) break;
            progress(PROGRESS_UNZIP, e + 1, entries, (unsigned char *)path + dir_len + 1);
            r = extract_entry();
        }
    }

    error = errno;
    unzip_pages_free(&job, pages);
    esx_f_close(zip);
    errno = r ? error : 0;
    return r;
}
