$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:BATON_CODEX_EXECUTABLE = (Get-Command codex -ErrorAction Stop).Source
node --import tsx server/laptop.ts
