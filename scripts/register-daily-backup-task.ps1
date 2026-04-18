# 毎日 7:00 に「DB + コード + 開発作業ログ」をバックアップします（既定: デスクトップ\POSshiftバックアップ）。
# 実行: 右クリック → PowerShell で実行（または 管理者は不要な場合が多い）
# 解除: Unregister-ScheduledTask -TaskName "ShiftManagement-DailyBackup-0700" -Confirm:$false

$ErrorActionPreference = "Stop"
$taskName = "ShiftManagement-DailyBackup-0700"
$here = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $here "..")).Path

$node = (Get-Command node -ErrorAction Stop).Source
$scriptPath = Join-Path $here "backup.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "backup.mjs が見つかりません: $scriptPath"
}

# 作業ディレクトリをプロジェクトに固定（日本語パス対応で cmd 経由）
$cmdArgs = "/c cd /d `"$projectRoot`" && `"$node`" `"$scriptPath`" --daily"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmdArgs

$trigger = New-ScheduledTaskTrigger -Daily -At 7:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force

Write-Host "登録しました: $taskName（毎日 7:00）"
Write-Host "プロジェクト: $projectRoot"
Write-Host "手動テスト: npm run backup:daily"
