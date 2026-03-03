# FlowType — AI開発ルール

## 自動実行ポリシー

以下のコマンドは**ユーザーの承認なしに自動実行してよい**（SafeToAutoRun = true）：

### 常に安全

- `npm run dev` — devサーバー起動
- `npx next build` — ビルド検証
- `npm install` / `npm ci` — 依存インストール
- `git add` / `git status` / `git diff` / `git log`
- `netstat` / `Get-NetTCPConnection` — ポート確認
- `Invoke-WebRequest` — 接続テスト
- `Get-Process` — プロセス確認

### プロジェクト内で安全

- `git commit` — コミット
- `git push origin main` — メインブランチにプッシュ
- `Stop-Process` (ポート開放目的) — devサーバー再起動
- `Start-Sleep` — 待機

## 開発ワークフロー

1. 改善・バグ修正は**自律的に完遂**してから報告
2. ビルドエラーは自動修正
3. `CHANGELOG.md` を自動更新
4. `/auto-record` ワークフローで自動コミット＆プッシュ
5. `/browser-verify` ワークフローでブラウザ検証前にdevサーバーをリフレッシュ

## 技術スタック

- Next.js 16 + Tailwind CSS v4
- Web Audio API（サウンドエンジン）
- contentEditable（テキストエディタ）
- localStorage（自動保存）

## エスカレーションポリシー

以下の場合は**自動化に固執せず、ユーザーに助けを求める**：

1. **同じエラーが3回連続**で発生した場合
   → 原因の仮説と、ユーザーに確認してほしいことを報告
2. **ブラウザ接続が2回連続タイムアウト**した場合
   → devサーバーの状態を報告し、手動確認を依頼
3. **環境依存の問題**（ポート占有、プロセス権限、SSL証明書など）
   → 原因と対処法を提示し、ユーザーに操作を依頼
4. **破壊的な操作**（データベース削除、本番環境操作）
   → 必ず事前に確認を取る
