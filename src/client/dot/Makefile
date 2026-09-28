NAME ?= spun
BUILD_DIR ?= ./BUILD-$(NAME)
TMP_DIR ?= ./TMP
COMMON ?= ../../vendor/NBNtools/clients/common
UNZIP ?= ../unzip
UNZIP_BANK ?= 33

SERVER ?= spun.nextbestnetwork.com
PORT ?= 48128

CRT := 30

CC=zcc
CCFLAGS=+zxn -vn -O3 -startup=$(CRT) -clib=new -pragma-include:zpragma.inc
LDFLAGS=-m -lm
# Main ends below the stack, which starts at $BFE0 (zpragma.inc) with 1K reserved.
# appmake fails the build if data or BSS reaches the fence.
CZFLAGS=-Cz"--fullsize --main-fence 0xBBE0"
DEFINES='-DSPUN_SERVER=\"$(SERVER)\"' '-DSPUN_PORT=\"$(PORT)\"' -Ddotn -DUNZIP_BANK=$(UNZIP_BANK) -Cm-DUNZIP_BANK=$(UNZIP_BANK) -Ca-I$(UNZIP)

MKDIR := mkdir -p
RM := rm -rfv
MV := mv

POSIX_DIR ?= ./BUILD-posix
POSIX_CC ?= cc
POSIX_CFLAGS ?= -O2 -Wall -Wno-pointer-sign
POSIX_DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"'
POSIX_SRC := spun.c common/file.c BANK_net/net.c BANK_packages/catalogue.c BANK_packages/install.c BANK_packages/usage.c \
	unzip_posix.c $(COMMON)/nbn.c $(COMMON)/nbn_pages.c $(COMMON)/net_posix.c $(COMMON)/posix.c
POSIX_LIBZIP := $(shell pkg-config --cflags --libs libzip)
POSIX_GEN := $(POSIX_DIR)/messages.c $(POSIX_DIR)/spun_messages.c $(POSIX_DIR)/help.c

all: binaries

clean:
	$(RM) $(BUILD_DIR)
	$(RM) $(TMP_DIR)
	$(RM) $(NAME).map
	$(RM) $(NAME)_CODE.bin
	$(RM) $(NAME)_MAIN.bin
	$(RM) $(NAME)_UNASSIGNED.bin
	$(RM) $(POSIX_DIR)
	$(RM) $(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin

dirs:
	$(MKDIR) $(BUILD_DIR)
	$(MKDIR) $(TMP_DIR)

# BANK_NET
bank_47: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_47 --constsegBANK_47 \
		--datasegBANK_47 --bsssegBANK_47   \
		@BANK_net/net.lst -o$(TMP_DIR)/BANK_net.o

# The NBNtools code in BANK_NET. Its BSS (nbnBuff) stays in main, where main and both banks reach it
bank_47_nbn: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_47 --constsegBANK_47 --datasegBANK_47 \
		@BANK_net/nbn.lst -o$(TMP_DIR)/BANK_net_nbn.o

# BANK_PACKAGES
bank_46: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_46 --constsegBANK_46 \
		--datasegBANK_46 --bsssegBANK_46   \
		@BANK_packages/packages.lst -o$(TMP_DIR)/BANK_packages.o

banks: bank_47 bank_47_nbn bank_46

# Run inside $(UNZIP): INCLUDE resolves from the current directory
$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin: $(UNZIP)/inflate.asm $(UNZIP)/inflate_job.inc
	cd $(UNZIP) && z88dk-z80asm -mz80n -b inflate.asm && rm -f inflate.o inflate.bin

dotn: banks $(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin
	$(CC) $(CCFLAGS) $(LDFLAGS) $(DEFINES) @spun.lst -o$(NAME) -create-app -subtype=dotn $(CZFLAGS)
	$(MV) $(NAME) $(BUILD_DIR)/$(NAME)

binaries: dirs dotn

posix: $(POSIX_DIR)/$(NAME)

$(POSIX_DIR)/$(NAME): $(POSIX_SRC) $(POSIX_GEN) $(COMMON)/*.h *.h common/*.h BANK_*/*.h $(UNZIP)/unzip.h
	$(POSIX_CC) $(POSIX_CFLAGS) $(POSIX_DEFINES) -o $@ $(POSIX_SRC) $(POSIX_GEN) $(POSIX_LIBZIP)

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

.PHONY: all clean dirs banks bank_47 bank_47_nbn bank_46 dotn binaries posix
