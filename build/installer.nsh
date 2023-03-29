!macro customInit
  nsExec::Exec `taskkill /im "osc-goes-brrr.exe"`
  IfFileExists osc-goes-brrr.exe 0 not_upgrading_from_old_ogb
  Delete osc-goes-brrr.exe
  !appendfile "_ DELETE THIS FOLDER" ""
  !appendfile "_ OscGoesBrrr IS NOW IN YOUR START MENU" ""
  not_upgrading_from_old_ogb:
!macroend
