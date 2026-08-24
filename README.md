# SwitchBot + SESAME Web Remote

同じWi-Fiに接続したスマートフォンから使う、ローカル専用のスマートホームリモコンです。
SwitchBot API v1.1とSESAME Cloud Web APIを利用し、家電操作、シーン実行、玄関の状態確認と施錠・解錠を行います。

APIキーとSecretはMac上の `.env.local` にだけ保存され、ブラウザには送信されません。

## Setup

1. `.env.example` を `.env.local` として複製します。
2. SwitchBotアプリの「プロフィール → 設定 → アプリバージョンを10回タップ → Developer Options」でTokenとSecretを取得します。
3. `.env.local` の `SWITCHBOT_TOKEN` と `SWITCHBOT_SECRET` に貼り付けます。
4. `OWNER_PIN` に管理者用、`GUEST_PIN` に家族などの利用者用アクセスコードを設定します。
5. SESAMEを使う場合は、SESAME Bizの開発者向けページからAPIキー、玄関SESAMEのUUID、デバイスシークレットキーを取得します。
6. `.env.local` の `SESAME_API_KEY`、`SESAME_DEVICE_UUID`、`SESAME_SECRET_KEY` に貼り付けます。
7. `npm install` と `npm run dev` を実行します。
8. 表示されたNetwork URLを、同じWi-Fiに接続したスマートフォンで開きます。

```dotenv
SWITCHBOT_TOKEN=your-token
SWITCHBOT_SECRET=your-secret
OWNER_PIN=your-owner-access-code
GUEST_PIN=your-guest-access-code
PUBLIC_UNTIL=
SESAME_API_KEY=your-sesame-api-key
SESAME_DEVICE_UUID=your-sesame-uuid
SESAME_SECRET_KEY=your-32-character-hex-secret
SESAME_HISTORY_TAG=WebRemote
```

以前の `REMOTE_PIN` は管理者コードとして引き続き利用できます。管理者でログインすると、
SwitchBotアカウント内の一覧からWebリモコンに表示するデバイスとシーンを選択できます。
利用者には選択済みの項目だけが表示され、追加・削除はできません。選択内容はMac側に保存されます。
SESAMEの解錠操作は管理者だけに表示され、利用者は状態確認と施錠のみ実行できます。
管理者は表示項目の管理画面から、複数のSwitchBot機器をまとめてOFFにするボタンを作成・削除できます。
作成済みの一括OFFボタンは、管理者と利用者の両方が実行できます。

`OWNER_PIN` または従来の `REMOTE_PIN` は必須です。
インターネットへのポート開放はしないでください。

一時公開する場合は、APIキーとPINを公開先のサーバー環境変数として保存し、
`PUBLIC_UNTIL` にISO 8601形式の期限（例: `2026-08-27T12:00:00+09:00`）を設定します。
期限に達すると、正しいアクセスコードでもAPI操作は拒否されます。

## Available Controls

- SwitchBotアプリで作成した手動シーンの実行
- 対応デバイスのON/OFF
- 赤外線ライトは実状態を推測せず、ONとOFFを常に両方表示
- Botの「押す」
- カーテンの開閉
- ロックの施錠・解錠
- SESAMEの状態・電池残量確認、施錠、管理者による解錠
- 管理者が選択した複数機器の一括OFF
- 物理デバイスの状態更新

DIY Air Conditionerは、SwitchBotアプリに登録されている現在の設定を保ったままON/OFFできます。
温度や運転モードを指定する操作は、SwitchBotアプリで作成したシーンから実行します。

## Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```
