!macro customInit
    nsExec::Exec `taskkill /im "osc-goes-brrr.exe"`
    IfFileExists osc-goes-brrr.exe 0 not_upgrading_from_old_ogb
        Delete osc-goes-brrr.exe
        Delete *.dll
        Delete *.pak
        Delete *.bin
        Delete *.dat
        Delete *.json
        Delete *.txt
        Delete *.html
        RMDir /r locales
        RMDir /r resources
        FileOpen $9 "DELETE THIS FOLDER" w
        FileClose $9
        FileOpen $9 "OscGoesBrrr IS NOW INSTALLED" w
        FileClose $9
    not_upgrading_from_old_ogb:
!macroend
