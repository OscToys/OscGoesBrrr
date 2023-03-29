!macro customInit
  nsExec::Exec `taskkill /im "osc-goes-brrr.exe"`
  IfFileExists $EXEDIR/osc-goes-brrr.exe 0 not_upgrading_from_old_ogb
  Delete $EXEDIR/osc-goes-brrr.exe
  !appendfile "$EXEDIR/_ DELETE THIS FOLDER" ""
  !appendfile "$EXEDIR/_ OscGoesBrrr IS NOW IN YOUR START MENU" ""
  not_upgrading_from_old_ogb:
!macroend
