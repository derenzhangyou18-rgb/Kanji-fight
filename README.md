# 漢字バトル ONLINE (オンライン試作版)

## iPadでの設定
1. SupabaseでSQL Editorに `supabase.sql` の内容を貼り付けて実行済みであることを確認します。
2. `config.js` の `SUPABASE_URL` は設定済みです。
3. `SUPABASE_ANON_KEY` の値 `PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE` を、SupabaseのPublishable key (`sb_publishable_...`) に置き換えてください。
4. Secret/service_role keyは絶対に使用しないでください。
5. `index.html`, `style.css`, `game.js`, `config.js` は同じフォルダに配置します。
6. GitHub Pages等へアップロードして公開します。

## 現時点の制約
これは学習用MVPです。ゲーム位置・攻撃判定・ダメージはクライアント側処理のため、ランク戦の不正対策として不十分です。オンライン対戦の同期、相手データ表示、途中切断、勝敗/ポイント処理などは本番品質ではありません。公開ランク戦の前にサーバー側でゲーム状態・ダメージ・勝敗・ポイントを検証する仕組みが必要です。
