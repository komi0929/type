---
description: ブラウザ検証前にdevサーバーを確実にリフレッシュする
---

// turbo-all

# ブラウザ検証ワークフロー

ブラウザサブエージェントで検証する前に、以下を毎回実行する。

## 1. ポート開放 & サーバー再起動

```powershell
# 古いプロセスをkill
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
```

## 2. devサーバー起動

```powershell
npm run dev
```

3秒以上待ってから `http://localhost:3000` に接続確認する。

## 3. 接続テスト（ブラウザ前に実行）

```powershell
try { $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing; Write-Output "OK: $($r.StatusCode)" } catch { Write-Output "NG: $($_.Exception.Message)" }
```

**OKが返ったら**ブラウザサブエージェントを実行する。

## ⚠️ 注意事項

- devサーバーは**3時間以上稼働したら再起動**する（HMR蓄積による応答遅延の防止）
- ポートが他プロセスに占有されている場合は `Stop-Process` で強制解放する
- ブラウザサブエージェントのタスクは**シンプルで短く**する（1つのタスクに5アクション以内）
