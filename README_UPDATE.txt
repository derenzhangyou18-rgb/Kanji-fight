漢字バトル ONLINE 統合更新

1) Supabase SQL Editorで finish_match_fix.sql を実行してください。
   start_match_roomの準備待ち機能と、各プレイヤーのポイント精算を含みます。
2) GitHubの game.js を、このZIP内の game.js に置き換えて Commit してください。
3) index.html / style.css / config.js は変更していません。現行のものを維持しても構いません。
4) config.js のPublishable keyは現在の設定値を保持しています。Secret/service_role keyは使わないでください。

注意:
このゲームは移動・攻撃・ダメージ・勝敗がクライアント側で計算される試作版です。
不正防止のための本格的なサーバー検証は未実装です。finish_matchは各プレイヤーの精算を一度だけ行うよう改善していますが、勝敗自体はクライアントから申告されるため、ランク戦の不正防止は完全ではありません。
