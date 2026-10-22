NAME ?= spun
TMP_DIR ?= ./TMP
COMMON ?= ../../vendor/NBNtools/clients/common
UNZIP ?= ../unzip
UNZIP_BANK ?= 33

PROD_SERVER := spun.nextbestnetwork.com
PROD_PORT := 48128
SERVER ?= $(PROD_SERVER)
PORT ?= $(PROD_PORT)

# .spunjane: .spun for the development server, beside the release .spun. Its server is in .env (gitignored)
-include .env
SPUNJANE_PORT ?= $(PROD_PORT)

# A build for any other server goes to BUILD-dev, so it never overwrites the release build
ifeq ($(SERVER):$(PORT),$(PROD_SERVER):$(PROD_PORT))
BUILD_DIR ?= ./BUILD-$(NAME)
else
BUILD_DIR ?= ./BUILD-dev
endif

VERSION := $(shell cat ../VERSION)

# The release zip: the dot command as spun.dot, then these files, all at the zip's root
ZIP := $(BUILD_DIR)/$(NAME)-$(VERSION).zip
BAS := $(BUILD_DIR)/spun.bas
ZIP_FILES := ../zip/README.txt ../zip/spun.gde $(BAS)
TXT2BAS ?= txt2bas

CRT := 30

# z88dk runs in its Docker image, with src/ mounted at the same path, so relative and absolute paths both work
SRC_ROOT := $(abspath ../..)
Z88DK_IMAGE ?= z88dk/z88dk:latest
Z88DK_RUN = docker run --rm --user $(shell id -u):$(shell id -g) -e HOME=/tmp -v $(SRC_ROOT):$(SRC_ROOT) -w $(1) $(Z88DK_IMAGE)

ZOPT ?= --max-allocs-per-node200000
CC=$(call Z88DK_RUN,$(CURDIR)) zcc
CCFLAGS=+zxn -vn -startup=$(CRT) -clib=sdcc_iy -SO3 $(ZOPT) --opt-code-size -pragma-include:zpragma.inc '-DSPUN_VERSION=\"$(VERSION)\"' '-DSPUN_NAME=\"$(NAME)\"'
LDFLAGS=-m
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
POSIX_DEFINES='-DSPUN_SERVER="$(SERVER)"' '-DSPUN_PORT="$(PORT)"' '-DSPUN_VERSION="$(VERSION)"' '-DSPUN_NAME="$(NAME)"'
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

# make compiles a bank again only when a file it is built from is newer than its object.
# Any header, the build settings or this Makefile make every bank compile again
lst_files = $(1) $(addprefix $(dir $(1)),$(shell cat $(1)))
HEADERS := $(wildcard *.h */*.h $(COMMON)/*.h $(UNZIP)/*.h)
DEPS := $(HEADERS) zpragma.inc ../VERSION Makefile

# BANK_PACKAGES
$(TMP_DIR)/BANK_packages.o: $(call lst_files,BANK_packages/packages.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_46 --constsegBANK_46 \
		--datasegBANK_46 --bsssegBANK_46   \
		@BANK_packages/packages.lst -o$@

# BANK_GUI: the GUI's own code, the screen set-up (layers, font, NextZXOS's back), the modal boxes
# and the network code. The NBNtools code's BSS (nbnBuff) stays in main, where main and every bank reach it
$(TMP_DIR)/BANK_gui.o: $(call lst_files,BANK_gui/gui.lst) $(call lst_files,BANK_screen/screen.lst) $(call lst_files,BANK_ui/ui.lst) \
		BANK_screen/specp437_128-255.bin $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 \
		--datasegBANK_44 --bsssegBANK_44   \
		@BANK_gui/gui.lst @BANK_screen/screen.lst @BANK_ui/ui.lst -o$@

$(TMP_DIR)/BANK_net.o: $(call lst_files,BANK_net/net.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 \
		--datasegBANK_44 --bsssegBANK_44   \
		@BANK_net/net.lst -o$@

$(TMP_DIR)/BANK_net_nbn.o: $(call lst_files,BANK_net/nbn.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_44 --constsegBANK_44 --datasegBANK_44 \
		@BANK_net/nbn.lst -o$@

# BANK_APP: the GUI's app page
$(TMP_DIR)/BANK_app.o: $(call lst_files,BANK_app/app.lst) $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c \
		--codesegBANK_42 --constsegBANK_42 \
		--datasegBANK_42 --bsssegBANK_42   \
		@BANK_app/app.lst -o$@

# BANK_SPRITES: the sprite sheet, data only
$(TMP_DIR)/BANK_sprites.o: $(call lst_files,BANK_sprites/sprites.lst) BANK_sprites/ui.spr $(DEPS) | dirs
	$(CC) $(CCFLAGS) -c @BANK_sprites/sprites.lst -o$@

bank_46: $(TMP_DIR)/BANK_packages.o
bank_44: $(TMP_DIR)/BANK_gui.o $(TMP_DIR)/BANK_net.o $(TMP_DIR)/BANK_net_nbn.o
bank_43: $(TMP_DIR)/BANK_sprites.o
bank_42: $(TMP_DIR)/BANK_app.o

banks: bank_46 bank_44 bank_43 bank_42

BANK_OBJS := $(addprefix $(TMP_DIR)/BANK_,net.o net_nbn.o packages.o gui.o sprites.o app.o)

# Run inside $(UNZIP): INCLUDE resolves from the current directory
$(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin: $(UNZIP)/inflate.asm $(UNZIP)/inflate_job.inc
	$(call Z88DK_RUN,$(abspath $(UNZIP))) z88dk-z80asm -mz80n -b inflate.asm
	rm -f $(UNZIP)/inflate.o $(UNZIP)/inflate.bin

# Main: the server and port are compiled in here only, so .env (the spunjane server) is a prerequisite
$(TMP_DIR)/main.o: $(call lst_files,spun.lst) help.txt $(UNZIP)/inflate_PAGEA.bin $(UNZIP)/inflate_PAGEC.bin \
		$(UNZIP)/inflate_job.inc $(DEPS) $(wildcard .env) | dirs
	$(CC) $(CCFLAGS) $(DEFINES) -c @spun.lst -o$@

$(BUILD_DIR)/$(NAME): $(TMP_DIR)/main.o $(BANK_OBJS) | dirs
	$(CC) $(CCFLAGS) $(LDFLAGS) $(DEFINES) $(TMP_DIR)/main.o $(BANK_OBJS) -o$(NAME) -create-app -subtype=dotn $(CZFLAGS)
	$(MV) $(NAME) $@

dotn: $(BUILD_DIR)/$(NAME)

binaries: dotn

# The menu runs the dot command it was zipped with
$(BAS): ../zip/spun.txt | dirs
	sed -e 's/spun\.dot/$(NAME).dot/g' -e 's|c:/dot/spun"|c:/dot/$(NAME)"|' -e 's/\.spun/.$(NAME)/g' -e 's/\.\$$ spun /.$$ $(NAME) /' $< > $(TMP_DIR)/spun.txt
	$(TXT2BAS) -i $(TMP_DIR)/spun.txt -o $@

zip: binaries $(BAS)
	$(RM) $(BUILD_DIR)/zip $(ZIP)
	$(MKDIR) $(BUILD_DIR)/zip
	cp $(BUILD_DIR)/$(NAME) $(BUILD_DIR)/zip/$(NAME).dot
	cp $(ZIP_FILES) $(BUILD_DIR)/zip/
	cd $(BUILD_DIR)/zip && zip -X -q $(abspath $(ZIP)) $(NAME).dot $(notdir $(ZIP_FILES))
	$(RM) $(BUILD_DIR)/zip

spunjane:
	@test -n "$(SPUNJANE_SERVER)" || { echo "Set SPUNJANE_SERVER in .env" >&2; exit 1; }
	$(MAKE) NAME=spunjane SERVER=$(SPUNJANE_SERVER) PORT=$(SPUNJANE_PORT) BUILD_DIR=./BUILD-spunjane TMP_DIR=./TMP-spunjane zip

posix: $(POSIX_DIR)/$(NAME)

$(POSIX_DIR)/$(NAME): $(POSIX_SRC) $(POSIX_GEN) $(COMMON)/*.h *.h common/*.h BANK_*/*.h $(UNZIP)/unzip.h ../VERSION
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

.DELETE_ON_ERROR:

.PHONY: all clean dirs spunjane banks bank_46 bank_44 bank_43 bank_42 dotn binaries zip posix
