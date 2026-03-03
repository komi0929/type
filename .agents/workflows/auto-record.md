---
description: コード変更後にCHANGELOGを更新しGitに自動記録する
---

// turbo-all

# Auto-Record ワークフロー

コード変更が完了したら、以下を自動実行する。

1. `CHANGELOG.md` の先頭に変更内容を追記する（カテゴリ: Feature / Bug Fix / Refactor / Design / Config / Docs / Cleanup）
2. `git add -A` で全変更をステージング
3. `git commit -m "[Emoji] 変更の要約"` でコミット（絵文字プレフィクス: ✨Feature / 🐛Bug / 🎨Design / ♻️Refactor / 🗑️Cleanup / 📝Docs / 🔧Config）
4. `git push origin main` でリモートにプッシュ
