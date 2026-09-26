SECTION rodata_user

PUBLIC _err_no_release
PUBLIC _err_no_app
PUBLIC _err_bad_query
PUBLIC _err_no_file
PUBLIC _err_server_error

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
