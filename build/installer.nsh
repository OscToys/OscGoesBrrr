!macro customInit
    nsExec::Exec `taskkill /im "osc-goes-brrr.exe"`
    IfFileExists "$EXEDIR\osc-goes-brrr.exe" 0 not_upgrading_from_old_ogb
        Delete "$EXEDIR\osc-goes-brrr.exe"
        Delete "$EXEDIR\*.dll"
        Delete "$EXEDIR\*.pak"
        Delete "$EXEDIR\*.bin"
        Delete "$EXEDIR\*.dat"
        Delete "$EXEDIR\*.json"
        Delete "$EXEDIR\*.txt"
        Delete "$EXEDIR\*.html"
        RMDir /r "$EXEDIR\locales"
        RMDir /r "$EXEDIR\resources"
        FileOpen $9 "DELETE THIS FOLDER" w
        FileClose $9
        FileOpen $9 "OscGoesBrrr IS NOW INSTALLED" w
        FileClose $9
    not_upgrading_from_old_ogb:
!macroend
