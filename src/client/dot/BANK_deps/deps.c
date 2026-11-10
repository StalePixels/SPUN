#include "../common/spun.h"
#include "../BANK_net/net.h"
#include "../BANK_net/reply.h"
#include "../BANK_packages/install.h"
#include "deps.h"

// Every app of one tree, the app itself first. A dependency that two apps list is there once,
// which also ends a cycle. Each app's dependencies are indexes into edges, in the order SPDEPS gave
#define TREE_MAX 255
#define EDGES_MAX 4096
#define NEW 0
#define WALKING 1
#define DONE 2

static unsigned char ids[TREE_MAX][7];
static uint16_t serials[TREE_MAX];
static uint8_t counts[TREE_MAX];
static uint16_t edgeStart[TREE_MAX];
static uint8_t edgeCount[TREE_MAX];
static uint8_t state[TREE_MAX];
static uint8_t edges[EDGES_MAX];
static uint16_t edgesUsed;
static uint8_t used;

// One SPDEPS reply, copied out before the next request replaces it
static unsigned char listed[TREE_MAX][7];

static uint8_t stack[TREE_MAX];
static uint8_t next[TREE_MAX];
// The app through which the walk reached each dependency
static uint8_t parent[TREE_MAX];

// The app the caller is installing: the walk replaces all of these
static unsigned char savedUsername[sizeof(username)];
static unsigned char savedTitle[sizeof(title)];
static unsigned char savedDescription[sizeof(description)];
static unsigned char savedDate[sizeof(date)];
static unsigned char savedAppid[sizeof(appid)];
static unsigned char savedVersion[sizeof(version)];
static unsigned char savedInstallDir[sizeof(installDir)];
static unsigned char savedSuggestDir[sizeof(suggestDir)];
static uint16_t savedSerial;
static uint32_t savedDownloads;
static uint8_t savedCount;

static void save(void) {
    strcpy(savedUsername, username);
    strcpy(savedTitle, title);
    strcpy(savedDescription, description);
    strcpy(savedDate, date);
    strcpy(savedAppid, appid);
    strcpy(savedVersion, version);
    strcpy(savedInstallDir, installDir);
    strcpy(savedSuggestDir, suggestDir);
    savedSerial = serial;
    savedDownloads = downloads;
    savedCount = dependsCount;
}

static void restore(void) {
    strcpy(username, savedUsername);
    strcpy(title, savedTitle);
    strcpy(description, savedDescription);
    strcpy(date, savedDate);
    strcpy(appid, savedAppid);
    strcpy(version, savedVersion);
    strcpy(installDir, savedInstallDir);
    strcpy(suggestDir, savedSuggestDir);
    serial = savedSerial;
    downloads = savedDownloads;
    dependsCount = savedCount;
}

static uint8_t find(unsigned char *id) __z88dk_fastcall {
    uint8_t at;

    for(at = 0; at < used; at++) {
        if(strcmp(ids[at], id) == 0) return at;
    }
    return TREE_MAX;
}

// The server keeps a LOG baddep only for a dependency of the release of the last SPDEPS,
// so it goes before the next one
static void missing(unsigned char *id) __z88dk_fastcall {
    if(!quiet) printf("Dependency %s is not on SPUN\n", id);
    depWarning = err_dep_missing;
    sprintf(nbnBuff, "LOG baddep=%s\x0A", id);
    _far(BANK_NET, (far_fn_t)line_send);
}

// Asks for the dependencies of app at, and adds each new one with its latest release
static void list_deps(uint8_t at) __z88dk_fastcall {
    unsigned char *error;
    uint8_t count = 0;
    uint8_t item;
    uint8_t found;

    edgeStart[at] = edgesUsed;
    edgeCount[at] = 0;
    if(!counts[at]) return;

    sprintf(nbnBuff, "SPDEPS %s %u\x0A", ids[at], serials[at]);
    if((error = _far(BANK_NET, (far_fn_t)reply_request))) {
        if(error == err_no_app || error == err_no_release) return;
        NBN_Fail(error);
    }
    while(count < TREE_MAX && _farWithPointer(BANK_NET, (far_ptr_fn_t)deps_next, appid)) {
        strcpy(listed[count++], appid);
    }

    for(item = 0; item < count; item++) {
        found = find(listed[item]);
        if(found == TREE_MAX) {
            strcpy(appid, listed[item]);
            error = _farWithPointer(BANK_NET, (far_ptr_fn_t)latest, appid);
            if(error == err_no_app || error == err_no_release) {
                missing(listed[item]);
                continue;
            }
            if(error) NBN_Fail(error);
            if(used == TREE_MAX) NBN_Fail(err_too_many_deps);
            found = used++;
            strcpy(ids[found], listed[item]);
            serials[found] = serial;
            counts[found] = dependsCount;
            state[found] = NEW;
        }
        if(edgesUsed == EDGES_MAX) NBN_Fail(err_too_many_deps);
        edges[edgesUsed++] = found;
        edgeCount[at]++;
    }
}

// The directory of app at: its own, or else that of the app that named it, up to the app itself
static void parent_dir(uint8_t at) __z88dk_fastcall {
    unsigned char *dir;

    while(at) {
        strcpy(appid, ids[at]);
        if((dir = _farWithPointer(BANK_PACKAGES, (far_ptr_fn_t)dep_dir, appid))) {
            strcpy(parentDir, dir);
            return;
        }
        at = parent[at];
    }
    strcpy(parentDir, savedInstallDir);
}

// Each dependency after its own dependencies, and the app itself, at 0, is left to the caller
static unsigned char *install_tree(void) {
    unsigned char *error;
    uint8_t depth = 1;
    uint8_t at;
    uint8_t to;

    stack[0] = 0;
    next[0] = 0;
    state[0] = WALKING;
    while(depth) {
        at = stack[depth - 1];
        if(next[depth - 1] < edgeCount[at]) {
            to = edges[edgeStart[at] + next[depth - 1]++];
            if(state[to] != NEW) continue;
            state[to] = WALKING;
            parent[to] = at;
            stack[depth] = to;
            next[depth] = 0;
            depth++;
            continue;
        }
        state[at] = DONE;
        depth--;
        if(!at) break;
        parent_dir(parent[at]);
        strcpy(appid, ids[at]);
        if((error = _farWithPointer(BANK_PACKAGES, (far_ptr_fn_t)dep_install, appid))) return error;
    }
    return NULL;
}

unsigned char *deps_install(void) {
    unsigned char *error;
    uint8_t at;

    save();
    used = 1;
    edgesUsed = 0;
    strcpy(ids[0], appid);
    serials[0] = serial;
    counts[0] = dependsCount;
    for(at = 0; at < used; at++) list_deps(at);

    error = install_tree();
    restore();
    return error;
}
