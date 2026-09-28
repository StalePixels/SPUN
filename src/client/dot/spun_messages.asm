SECTION rodata_user

PUBLIC _err_no_release
PUBLIC _err_no_app
PUBLIC _err_bad_query
PUBLIC _err_no_file
PUBLIC _err_server_error
PUBLIC _err_bad_catalogue
PUBLIC _err_installed_newer
PUBLIC _err_bad_directory
PUBLIC _err_no_memory
PUBLIC _err_browser
PUBLIC _err_drive
PUBLIC _err_no_directories
PUBLIC _err_unzip_read
PUBLIC _err_unzip_format
PUBLIC _err_unzip_unsupported
PUBLIC _err_unzip_path
PUBLIC _err_unzip_create
PUBLIC _err_unzip_write
PUBLIC _err_unzip_data
PUBLIC _err_unzip_check

_err_no_release:
   defm "App has no releas", 'e' + 0x80
_err_no_app:
   defm "App not foun", 'd' + 0x80
_err_bad_query:
   defm "Bad search or pag", 'e' + 0x80
_err_no_file:
   defm "Release file not foun", 'd' + 0x80
_err_server_error:
   defm "Server refused reques", 't' + 0x80
_err_bad_catalogue:
   defm "Bad line in /sys/spun.ca", 't' + 0x80
_err_installed_newer:
   defm "Installed release is newe", 'r' + 0x80
_err_bad_directory:
   defm "Bad install director", 'y' + 0x80
_err_no_memory:
   defm "Not enough free memor", 'y' + 0x80
_err_unzip_read:
   defm "Cannot read the zi", 'p' + 0x80
_err_unzip_format:
   defm "Zip is damaged or not a zi", 'p' + 0x80
_err_unzip_unsupported:
   defm "Zip uses an unsupported forma", 't' + 0x80
_err_unzip_path:
   defm "Zip has an unsafe file nam", 'e' + 0x80
_err_unzip_create:
   defm "Cannot create a fil", 'e' + 0x80
_err_unzip_write:
   defm "Cannot write a fil", 'e' + 0x80
_err_unzip_data:
   defm "Zip data is damage", 'd' + 0x80
_err_unzip_check:
   defm "Extracted file failed chec", 'k' + 0x80
_err_browser:
   defm "File browser faile", 'd' + 0x80
_err_drive:
   defm "Cannot change driv", 'e' + 0x80
_err_no_directories:
   defm "Drive has no directorie", 's' + 0x80
