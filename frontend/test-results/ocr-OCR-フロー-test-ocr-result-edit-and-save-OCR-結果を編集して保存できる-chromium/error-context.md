# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - heading "ログイン" [level=3] [ref=e6]
      - paragraph [ref=e7]: 名刺管理アプリケーションにログイン
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - generic [ref=e11]: メールアドレス *
          - textbox "メールアドレス *" [ref=e13]:
            - /placeholder: mail@example.com
        - generic [ref=e14]:
          - generic [ref=e15]: パスワード *
          - textbox "パスワード *" [ref=e17]:
            - /placeholder: パスワードを入力
        - button "ログイン" [ref=e18] [cursor=pointer]
      - generic [ref=e19]:
        - text: アカウントをお持ちでない方は
        - link "新規登録" [ref=e20] [cursor=pointer]:
          - /url: /register
  - button "Open Next.js Dev Tools" [ref=e26] [cursor=pointer]:
    - img [ref=e27]
  - alert [ref=e30]
```