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
# Main ends below the stack, which starts at $BFD8 (zpragma.inc) with 1K reserved;
# above it are the mouse variables and the IM2 table (gui/isr.asm).
# appmake fails the build if data or BSS reaches the fence.
CZFLAGS=-Cz"--fullsize --main-fence 0xBBD8"
DEFINES='-DSPUN_SERVER=\"$(SERVER)\"' '-DSPUN_PORT=\"$(PORT)\"' -Ddotn -DUNZIP_BANK=$(UNZIP_BANK) -Cm-DUNZIP_BANK=$(UNZIP_BANK) -Ca-I$(UNZIP)

MKDIR := mkdir -p
RM := rm -rfv
MV := mv

POSIX_DIR ?= ./BUILD-posix
POSIX_CC ?= cc
POSIX_CFLAGS ?= -O2 -Wall -Wno-pointer-sign
POSIX_DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"'
POSIX_SRC := spun.c common/file.c $(filter-out BANK_net/gui_%.c,$(wildcard BANK_net/*.c)) BANK_packages/catalogue.c BANK_packages/install.c BANK_packages/usage.c \
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

# BANK_GUI: the GUI's own code
bank_45: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_45 --constsegBANK_45 \
		--datasegBANK_45 --bsssegBANK_45   \
		@BANK_gui/gui.lst -o$(TMP_DIR)/BANK_gui.o

# BANK_SCREEN: sets up the GUI's layers and font and puts NextZXOS's back
bank_44: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 \
		--datasegBANK_44 --bsssegBANK_44   \
		@BANK_screen/screen.lst -o$(TMP_DIR)/BANK_screen.o

# BANK_APP: the GUI's app page
bank_42: dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_42 --constsegBANK_42 \
		--datasegBANK_42 --bsssegBANK_42   \
		@BANK_app/app.lst -o$(TMP_DIR)/BANK_app.o

# BANK_SPRITES: the sprite sheet, data only
bank_43: dirs
	$(CC) $(CCFLAGS) -c @BANK_sprites/sprites.lst -o$(TMP_DIR)/BANK_sprites.o

banks: bank_47 bank_47_nbn bank_46 bank_45 bank_44 bank_43 bank_42

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

.PHONY: all clean dirs banks bank_47 bank_47_nbn bank_46 bank_45 bank_44 bank_43 bank_42 dotn binaries posix
