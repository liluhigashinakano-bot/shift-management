import assert from "node:assert/strict";
import {
  canAttemptLogin,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginAttempts,
} from "./login-attempts";

// ==========================================================================
// ログインの失敗回数
//
// キャストのパスワードは 6 桁の数字（100 万通り）で、ID もキャスト名から推測しやすい。
// 回数制限が無いと外から順に試せる。
// ==========================================================================

// 初めての ID は試せる
resetLoginAttempts();
assert.equal(canAttemptLogin("kana"), true);

// 4 回失敗してもまだ試せる
resetLoginAttempts();
const now = Date.now();
for (let i = 0; i < 4; i++) recordLoginFailure("kana", now);
assert.equal(canAttemptLogin("kana", now), true);

// 5 回目で待たされる
recordLoginFailure("kana", now);
assert.equal(canAttemptLogin("kana", now), false);

// 別の ID は巻き添えにならない
assert.equal(canAttemptLogin("yuno", now), true);

// 大文字と小文字は同じ ID として数える（ログインも区別しない）
resetLoginAttempts();
for (let i = 0; i < 5; i++) recordLoginFailure("Kana", now);
assert.equal(canAttemptLogin("kana", now), false);
assert.equal(canAttemptLogin("KANA", now), false);

// 10 分待てばまた試せる
assert.equal(canAttemptLogin("kana", now + 10 * 60 * 1000 + 1), true);

// 途中で成功したら数を忘れる
resetLoginAttempts();
for (let i = 0; i < 4; i++) recordLoginFailure("kana", now);
recordLoginSuccess("kana");
for (let i = 0; i < 4; i++) recordLoginFailure("kana", now);
assert.equal(canAttemptLogin("kana", now), true);

// 30 分あくと数え直し（間隔をあけた打ち間違いで締め出さない）
resetLoginAttempts();
for (let i = 0; i < 4; i++) recordLoginFailure("kana", now);
recordLoginFailure("kana", now + 31 * 60 * 1000);
assert.equal(canAttemptLogin("kana", now + 31 * 60 * 1000), true);

resetLoginAttempts();
console.log("login-attempts (canAttemptLogin + recordLoginFailure): 10 patterns OK");
