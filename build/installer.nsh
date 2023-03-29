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
        FileOpen $9 "_ DELETE THIS FOLDER" w
        FileClose $9
        FileOpen $9 "_ OscGoesBrrr IS NOW IN YOUR START MENU" w
        FileClose $9
    not_upgrading_from_old_ogb:
!macroend
