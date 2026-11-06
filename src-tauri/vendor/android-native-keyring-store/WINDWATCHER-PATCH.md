# Android keyring 1.0.0 local patch

Source: published `android-native-keyring-store` 1.0.0 (MIT OR Apache-2.0).
Retain the original source and licenses. This is an Android-only Cargo patch,
not a new storage backend or an upstream audit endorsement.

Published archive SHA-256:
`48c6349ddff23194f8fdce2ea8849380f5a4868c1648965b70e801e104cba9b3`.
Packaged upstream revision: `7d8164fb1346b86ece49dfd9e511078bc9151a13`.

Three failure-contract fixes are required by the client:

- Check the boolean returned by SharedPreferences `commit()`. The original callers
  ignored `false`, incorrectly reporting a durable write/delete as successful.
- Return an error for malformed Base64 ciphertext rather than logging the value
  and returning `None` (which incorrectly means a missing credential).
- When a vault configuration exists, propagate unavailable/lost-key failures
  instead of treating it as a missing vault and generating a replacement key.

The pure commit-result test is included in the app's host `cargo test --lib`
suite; the JNI behavior must also be
tested in the installed Android application. Normal valid-data encryption and
alias formats are unchanged. Remove this patch only after verifying equivalent
upstream fixes and retaining corruption/commit failure regressions.
