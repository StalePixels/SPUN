NAME ?= spun
BUILD_DIR ?= ./BUILD-$(NAME)
COMMON ?= ../../vendor/NBNtools/clients/common

SERVER ?= spun.nextbestnetwork.com
PORT ?= 48128

CRT := 1

CC=zcc
CCFLAGS=+zxn -vn -O3 -startup=$(CRT) -clib=new
LDFLAGS=-m -lm
DEFINES='-DSPUN_SERVER=\"$(SERVER)\"' '-DSPUN_PORT=\"$(PORT)\"'

MKDIR := mkdir -p
RM := rm -rfv
MV := mv

POSIX_DIR ?= ./BUILD-posix
POSIX_CC ?= cc
POSIX_CFLAGS ?= -O2 -Wall -Wno-pointer-sign
POSIX_DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"'
POSIX_SRC := spun.c $(COMMON)/nbn.c $(COMMON)/net_posix.c $(COMMON)/posix.c
POSIX_GEN := $(POSIX_DIR)/messages.c $(POSIX_DIR)/spun_messages.c $(POSIX_DIR)/help.c

all: binaries

clean:
	$(RM) $(BUILD_DIR)
	$(RM) $(NAME).map
	$(RM) $(NAME)_CODE.bin
	$(RM) $(NAME)_MAIN.bin
	$(RM) $(NAME)_UNASSIGNED.bin
	$(RM) $(POSIX_DIR)

dirs:
	$(MKDIR) $(BUILD_DIR)

dotn:
	$(CC) $(CCFLAGS) $(LDFLAGS) $(DEFINES) @spun.lst -o$(NAME) -create-app -subtype=dotn
	$(MV) $(NAME) $(BUILD_DIR)/$(NAME)

binaries: dirs dotn

posix: $(POSIX_DIR)/$(NAME)

$(POSIX_DIR)/$(NAME): $(POSIX_SRC) $(POSIX_GEN) $(COMMON)/*.h *.h
	$(POSIX_CC) $(POSIX_CFLAGS) $(POSIX_DEFINES) -o $@ $(POSIX_SRC) $(POSIX_GEN)

$(POSIX_DIR)/messages.c: $(COMMON)/messages.asm $(COMMON)/messages2c.awk
	$(MKDIR) $(POSIX_DIR)
	awk -f $(COMMON)/messages2c.awk $(COMMON)/messages.asm > $@

$(POSIX_DIR)/spun_messages.c: spun_messages.asm $(COMMON)/messages2c.awk
	$(MKDIR) $(POSIX_DIR)
	awk -f $(COMMON)/messages2c.awk spun_messages.asm > $@

# The same file help.asm includes with BINARY
$(POSIX_DIR)/help.c: help.txt
	$(MKDIR) $(POSIX_DIR)
	( echo "unsigned char help[] = {"; xxd -i < help.txt; echo ", 0 };" ) > $@

.PHONY: all clean dirs dotn binaries posix
