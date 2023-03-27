!macro preInit
  nsExec::Exec `taskkill /im "osc-goes-brrr.exe" /fi "PID ne $pid"`
!macroend
